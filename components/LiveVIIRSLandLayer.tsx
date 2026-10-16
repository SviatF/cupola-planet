"use client";

import {useEffect,useRef,useState} from "react";
import * as THREE from "three";
import {useThree} from "@react-three/fiber";
import {compositeVIIRSLandSurface} from "@/lib/earth/viirsLandComposite";

export type LiveSurfaceStatus =
  | {state:"loading"; detail:string}
  | {state:"available"; detail:string; date:string; sensor:string; landPixelsPercent:number}
  | {state:"unavailable"; detail:string};
type Sensor="noaa21"|"noaa20"|"snpp";
type Candidate={texture:THREE.CanvasTexture;date:string;sensor:Sensor;percent:number};
const VALID_LAYER:Record<Sensor,string>={
  noaa21:"VIIRS_NOAA21_CorrectedReflectance_TrueColor",
  noaa20:"VIIRS_NOAA20_CorrectedReflectance_TrueColor",
  snpp:"VIIRS_SNPP_CorrectedReflectance_TrueColor",
};
const WIDTH=2048, HEIGHT=1024, MIN_LAND_COVERAGE=.006;
const CANDIDATES:{sensor:Sensor;daysAgo:number}[]=[
  {sensor:"noaa21",daysAgo:1},
  {sensor:"noaa20",daysAgo:1},
  {sensor:"snpp",daysAgo:1},
  {sensor:"noaa21",daysAgo:2},
];
// The response headers identify the actual NASA layer/date. Do not use a
// 2016 static fallback or black missing-data JPEG as live surface imagery.
async function fetchAndCompose(
  sensor:Sensor,daysAgo:number,oceanMask:THREE.Texture,signal:AbortSignal,
):Promise<Candidate|null>{
  const url="/api/satellite?"+new URLSearchParams({
    mode:"live",sensor,daysAgo:String(daysAgo),
  });
  const response=await fetch(url,{signal,cache:"no-store"});
  const expected=new Date();
  expected.setUTCDate(expected.getUTCDate()-daysAgo);
  const date=expected.toISOString().slice(0,10);
  if(!response.ok||
    !response.headers.get("content-type")?.startsWith("image/jpeg")||
    response.headers.get("x-cupola-source")!=="NASA_GIBS_VIIRS"||
    response.headers.get("x-cupola-layer")!==VALID_LAYER[sensor]||
    response.headers.get("x-cupola-sensor")!==sensor||
    response.headers.get("x-cupola-imagery-date")!==date)return null;
  const blob=await response.blob();
  if(blob.size<25_000||blob.size>16_000_000||signal.aborted)return null;
  const bitmap=await createImageBitmap(blob);
  try{
    if(bitmap.width!==WIDTH||bitmap.height!==HEIGHT||signal.aborted)return null;
    const sourceCanvas=document.createElement("canvas");
    sourceCanvas.width=WIDTH;sourceCanvas.height=HEIGHT;
    const sourceCtx=sourceCanvas.getContext("2d",{willReadFrequently:true});
    const oceanCanvas=document.createElement("canvas");
    oceanCanvas.width=WIDTH;oceanCanvas.height=HEIGHT;
    const oceanCtx=oceanCanvas.getContext("2d",{willReadFrequently:true});
    if(!sourceCtx||!oceanCtx)return null;
    const maskImage=oceanMask.image as CanvasImageSource & {width?:number;height?:number};
    if(!maskImage||!maskImage.width||!maskImage.height)return null;
    sourceCtx.drawImage(bitmap,0,0,WIDTH,HEIGHT);
    oceanCtx.drawImage(maskImage,0,0,WIDTH,HEIGHT);
    // ImageData is owned entirely by the source satellite; the ocean mask
    // comes from our already-loaded static NASA/Three Earth specular texture.
    const optical=sourceCtx.getImageData(0,0,WIDTH,HEIGHT);
    const ocean=oceanCtx.getImageData(0,0,WIDTH,HEIGHT);
    const composite=compositeVIIRSLandSurface(
      optical.data,ocean.data,WIDTH,HEIGHT);
    if(composite.stats.coverageFraction<MIN_LAND_COVERAGE)return null;
    // The uploaded RGBA color is always a REAL optical NASA pixel;
    // transparent pixels preserve the original cinematic globe unchanged.
    const updated=document.createElement("canvas");
    updated.width=WIDTH;updated.height=HEIGHT;
    const ctx=updated.getContext("2d");
    if(!ctx)return null;
    const imageData=ctx.createImageData(WIDTH,HEIGHT);
    imageData.data.set(composite.pixels);
    ctx.putImageData(imageData,0,0);
    const texture=new THREE.CanvasTexture(updated);
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.wrapS=THREE.RepeatWrapping;
    texture.wrapT=THREE.ClampToEdgeWrapping;
    texture.generateMipmaps=true;
    texture.minFilter=THREE.LinearMipmapLinearFilter;
    texture.magFilter=THREE.LinearFilter;
    texture.needsUpdate=true;
    return {texture,date,sensor,
      percent:Math.round(composite.stats.coverageFraction*1000)/10};
  }finally{bitmap.close();}
}

/** A physically shaded transparent land-only image ON THE ROTATING EARTH.
 * Planet base, Cloud V3 geometry, static ocean, glint, city-light shaders,
 * moon/satellites and the Cinema/Explore renderer remain untouched.
 *
 * RGB exclusion is conservatively VISUAL, never official VIIRS cloud QA.
 * Visible satellite-land updates are experimental, not guaranteed cloud-free.
 */
export default function LiveVIIRSLandLayer({
  enabled,oceanMask,onStatus,
}:{enabled:boolean;oceanMask:THREE.Texture;
  onStatus:(status:LiveSurfaceStatus|null)=>void;
}){
  const {gl}=useThree();
  const [current,setCurrent]=useState<THREE.CanvasTexture|null>(null);
  const owned=useRef<THREE.CanvasTexture|null>(null);
  const version=useRef<string|null>(null);
  const statusCallback=useRef(onStatus);
  statusCallback.current=onStatus;
  useEffect(()=>{
    if(!enabled){
      statusCallback.current(null);
      return;
    }
    let stopped=false,inFlight=false;
    const signalController=new AbortController();
    statusCallback.current({state:"loading",detail:"NOAA VIIRS · CHECKING LAND PIXELS"});
    const reload=async()=>{
      if(inFlight||stopped)return;
      const bucket=Math.floor(Date.now()/(3*60*60_000));
      const yesterday=new Date(Date.now()-86_400_000).toISOString().slice(0,10);
      if(version.current===yesterday+"@"+bucket)return;
      inFlight=true;
      try{
        let chosen:Candidate|null=null;
        for(const {sensor,daysAgo} of CANDIDATES){
          if(stopped||signalController.signal.aborted)return;
          chosen=await fetchAndCompose(sensor,daysAgo,oceanMask,signalController.signal)
            .catch(()=>null);
          if(chosen)break;
        }
        if(stopped||signalController.signal.aborted){
          chosen?.texture.dispose();return;
        }
        if(!chosen){
          if(!owned.current)statusCallback.current({
            state:"unavailable",detail:"NO VERIFIED LAND PIXELS · BASE EARTH PRESERVED",
          });
          return;
        }
        chosen.texture.anisotropy=Math.min(8,gl.capabilities.getMaxAnisotropy());
        const previous=owned.current;
        owned.current=chosen.texture;
        version.current=yesterday+"@"+bucket;
        setCurrent(chosen.texture);
        // Observable integration signal for deployed browser QA: emitted ONLY
        // after a real NOAA image was validated and an RGBA GPU texture made.
        window.dispatchEvent(new CustomEvent("cupola-viirs-land-applied",{
          detail:{source:"NASA_GIBS_VIIRS",date:chosen.date,sensor:chosen.sensor,
            landPixelsPercent:chosen.percent,gpuTextureReady:true},
        }));
        statusCallback.current({
          state:"available",
          date:chosen.date,sensor:chosen.sensor,landPixelsPercent:chosen.percent,
          detail:"REAL VIIRS LAND PIXELS · OPTICAL SCREEN / NOT QA",
        });
        if(previous)window.setTimeout(()=>previous.dispose(),1250);
      }finally{inFlight=false;}
    };
    void reload();
    const timer=window.setInterval(()=>void reload(),30*60_000);
    return()=>{
      stopped=true;signalController.abort();window.clearInterval(timer);
      const previous=owned.current;owned.current=null;version.current=null;
      setCurrent(null);
      statusCallback.current(null);
      if(previous)window.setTimeout(()=>previous.dispose(),1250);
    };
  },[enabled,oceanMask,gl]);
  if(!enabled||!current)return null;
  return(
    <mesh scale={1.00072} renderOrder={1} frustumCulled={false}>
      <sphereGeometry args={[2.5,192,192]}/>
      <meshPhysicalMaterial map={current}
        color="#ffffff" transparent opacity={.88} depthWrite={false}
        roughness={.74} metalness={0}
        clearcoat={.04} clearcoatRoughness={.6}
        polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1}
      />
    </mesh>
  );
}
