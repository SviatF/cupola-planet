"use client";

import { useEffect, useState } from "react";
import { parseDailyImageryInfo, type DailyImageryInfo } from "@/lib/earth/dailyImagery";
import { estimateViirsPreviewExtent, viirsFrameCrop } from "@/lib/earth/viirsPreviewCoverage";

type PreviewReady = {
  info:DailyImageryInfo;
  visibleFraction:number;
  thumbnail:string;
  daysAgo:number;
  size:{width:number;height:number};
};
type PreviewState =
  | {phase:"loading"}
  | {phase:"available";image:PreviewReady}
  | {phase:"unavailable";reason:string};

async function candidate(daysAgo:number,signal:AbortSignal):Promise<PreviewReady|null> {
  const url="/api/satellite?mode=live&daysAgo="+daysAgo;
  const response=await fetch(url,{signal,cache:"no-store"});
  if(!response.ok)return null;
  const format=(response.headers.get("content-type")||"").toLowerCase();
  if(!format.startsWith("image/jpeg"))return null;
  const date=response.headers.get("x-cupola-imagery-date")||"";
  const source=response.headers.get("x-cupola-source")||"";
  const layer=source.split(" · ").at(-1)||"";
  const expected=new Date();
  expected.setUTCDate(expected.getUTCDate()-daysAgo);
  if(date!==expected.toISOString().slice(0,10))return null;
  const info=parseDailyImageryInfo({
    kind:"surface",status:"daily-satellite",source:"NASA GIBS / VIIRS",
    layer,imageryDate:date,verifiedPixelTime:false,
    latestPixelObservationUnknown:true,gapFilled:false,
  },"surface");
  if(!info||!source.startsWith("NASA GIBS / VIIRS · "))return null;
  const blob=await response.blob();
  if(blob.size<25_000||blob.size>16_000_000)return null;
  if(signal.aborted)return null;
  const bitmap=await createImageBitmap(blob);
  try {
    if(bitmap.width!==2048||bitmap.height!==1024)return null;
    const sample=document.createElement("canvas");
    sample.width=256;sample.height=128;
    const context=sample.getContext("2d",{willReadFrequently:true});
    if(!context)return null;
    context.drawImage(bitmap,0,0,sample.width,sample.height);
    const rgba=context.getImageData(0,0,sample.width,sample.height).data;
    const visible=estimateViirsPreviewExtent(rgba,sample.width,sample.height);
    if(visible.status==="insufficient-imagery")return null;
    const crop=viirsFrameCrop(visible.bounds,bitmap.width,bitmap.height,4/3);
    const canvas=document.createElement("canvas");
    canvas.width=640;canvas.height=480;
    const output=canvas.getContext("2d");
    if(!output)return null;
    output.fillStyle="#05090d";
    output.fillRect(0,0,canvas.width,canvas.height);
    output.drawImage(bitmap,crop.x,crop.y,crop.width,crop.height,
      0,0,canvas.width,canvas.height);
    const thumbnail=canvas.toDataURL("image/jpeg",.83);
    return {
      info,visibleFraction:visible.visibleFraction,thumbnail,daysAgo,
      size:{width:bitmap.width,height:bitmap.height},
    };
  }finally{bitmap.close();}
}

/** Optical NRT scenes are partial orbital passes, not whole-planet basemaps.
 * The main Three.js Earth and Cloud V3 are deliberately NEVER touched.
 * Cropping only zooms the actually measured swath for legible inspection.
 */
export default function SatelliteSurfacePreview(
  {onImagery}:{onImagery:(info:DailyImageryInfo|null)=>void},
) {
  const [state,setState]=useState<PreviewState>({phase:"loading"});
  useEffect(()=>{
    let alive=true;
    const controller=new AbortController();
    let inFlight=false;
    const load=async()=>{
      if(inFlight||!alive)return;
      inFlight=true;
      try{
        // Prefer completed yesterday's scene over a mostly blank partial
        // current UTC day. Compare actual approximate raster coverage.
        const results=await Promise.allSettled([
          candidate(1,controller.signal),
          candidate(0,controller.signal),
        ]);
        let valid=results.flatMap(r=>r.status==="fulfilled"&&r.value?[r.value]:[]);
        if(!valid.some(v=>v.visibleFraction>=.09)&&!controller.signal.aborted){
          const older=await candidate(2,controller.signal).catch(()=>null);
          if(older)valid=[...valid,older];
        }
        if(!alive||controller.signal.aborted)return;
        // Real pixels first, freshness as tie-break. Prefer appreciably
        // better coverage to a mostly empty scene dated today.
        valid.sort((a,b)=>{
          const score=(v:PreviewReady)=>Math.min(v.visibleFraction,.85)
            +Math.max(0,2-v.daysAgo)*.025;
          return score(b)-score(a);
        });
        const selected=valid[0];
        if(!selected){
          onImagery(null);
          setState({phase:"unavailable",
            reason:"NO USABLE ORBIT SWATH · The latest daily satellite scenes contain insufficient image pixels."});
          return;
        }
        onImagery(selected.info);
        setState({phase:"available",image:selected});
      }catch{
        if(alive&&!controller.signal.aborted){
          onImagery(null);
          setState({phase:"unavailable",
            reason:"NASA GIBS IMAGE CURRENTLY UNAVAILABLE · CINEMA EARTH IS UNCHANGED"});
        }
      }finally{inFlight=false;}
    };
    void load();
    const timer=window.setInterval(()=>void load(),30*60_000);
    return()=>{
      alive=false;controller.abort();window.clearInterval(timer);
      onImagery(null);
    };
  },[onImagery]);

  if(state.phase==="loading")return (
    <div className="viirs-preview-state" role="status">
      <span className="viirs-preview-loading"/>
      SEARCHING NOAA / NASA VIIRS ORBIT PASSES...
      <small>Checking the last completed daily scenes for visible imagery.</small>
    </div>
  );
  if(state.phase==="unavailable")return (
    <div className="viirs-preview-state" role="status">
      {state.reason}
      <small>No black/no-data image will be presented as a complete Earth observation.</small>
    </div>
  );
  const {image}=state;
  const percent=Math.round(image.visibleFraction*100);
  const url="/api/satellite?mode=live&daysAgo="+image.daysAgo;
  return (
    <>
      <a href={url} target="_blank" rel="noopener noreferrer"
        title="Open original full-width NASA GIBS VIIRS image, including no-data areas">
        <img src={image.thumbnail} alt={"Zoomed observed NOAA/NASA VIIRS orbital swath from "+image.info.imageryDate+
          ". Surrounding unobserved areas are not represented in this closeup."}
          width={640} height={480}
          style={{width:"100%",maxHeight:250,aspectRatio:"4 / 3",objectFit:"cover",
            display:"block",borderRadius:9,background:"#060a12"}} />
      </a>
      <div className="viirs-preview-metrics" aria-label="VIIRS image source and data quality">
        <span>{image.info.imageryDate} · {image.info.layer.includes("NOAA21")?"NOAA-21":
          image.info.layer.includes("NOAA20")?"NOAA-20":"SUOMI NPP"}</span>
        <span>VISIBLE PIXELS ~{percent}%</span>
      </div>
      <p style={{fontSize:11,opacity:.82,margin:"8px 0 4px",lineHeight:1.5}}>
        REAL VIIRS ORBIT SWATH · AUTO-ZOOMED FOR INSPECTION
      </p>
      <p style={{fontSize:11,opacity:.63,margin:"0 0 7px",lineHeight:1.5}}>
        This is one or more partial satellite passes, not a global image.
        The visible-pixel estimate is not a scientific QA/cloud mask.
        Original scenes can contain clouds, dark ocean and no-data.
        The cinematic Earth and Cloud V3 remain unchanged.
      </p>
      <a className="viirs-preview-link" href={url} target="_blank"
        rel="noopener noreferrer">VIEW ORIGINAL WITH NO-DATA AREAS ↗</a>
    </>
  );
}
