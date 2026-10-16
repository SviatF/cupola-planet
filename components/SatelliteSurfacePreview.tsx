"use client";

import { useEffect, useState } from "react";
import { parseDailyImageryInfo, type DailyImageryInfo } from "@/lib/earth/dailyImagery";
import { estimateViirsPreviewExtent, viirsFrameCrop, type ViirsPreviewExtent } from "@/lib/earth/viirsPreviewCoverage";

type Sensor="noaa21"|"noaa20"|"snpp";
const SENSORS:Sensor[]=["noaa21","noaa20","snpp"];
type Candidate={
  info:DailyImageryInfo; sensor:Sensor; daysAgo:number;
  visibleFraction:number;extent:ViirsPreviewExtent;
};
type PreviewReady=Candidate&{thumbnail:string};
type PreviewState=
 | {phase:"loading";checks:number}
 | {phase:"available";image:PreviewReady;checks:number}
 | {phase:"unavailable";reason:string;checks:number;empty:number;failed:number};
const NASA_WORLDVIEW="https://worldview.earthdata.nasa.gov/";

async function readProbe(
  sensor:Sensor, daysAgo:number, signal:AbortSignal,
):Promise<{value:Candidate|null; reason:"empty"|"failed"|null}> {
  const args=new URLSearchParams({
    mode:"live",sensor,daysAgo:String(daysAgo),resolution:"probe",
  });
  const response=await fetch("/api/satellite?"+args,{signal,cache:"no-store"});
  if(!response.ok||!(response.headers.get("content-type")||"").startsWith("image/jpeg"))
    return {value:null,reason:"failed"};
  const date=response.headers.get("x-cupola-imagery-date")||"";
  const source=response.headers.get("x-cupola-source")||"";
  const layer=source.split(" · ").at(-1)||"";
  const expected=new Date();
  expected.setUTCDate(expected.getUTCDate()-daysAgo);
  if(date!==expected.toISOString().slice(0,10)||
    response.headers.get("x-cupola-sensor")!==sensor||
    !layer.includes(sensor==="noaa21"?"NOAA21":sensor==="noaa20"?"NOAA20":"SNPP"))
    return {value:null,reason:"failed"};
  const info=parseDailyImageryInfo({
    kind:"surface",status:"daily-satellite",source:"NASA GIBS / VIIRS",
    layer,imageryDate:date,verifiedPixelTime:false,
    latestPixelObservationUnknown:true,gapFilled:false,
  },"surface");
  if(!info||!source.startsWith("NASA GIBS / VIIRS · "))
    return {value:null,reason:"failed"};
  const blob=await response.blob();
  if(signal.aborted)return {value:null,reason:"failed"};
  if(blob.size<1200||blob.size>6_000_000)return {value:null,reason:"failed"};
  const bitmap=await createImageBitmap(blob);
  try{
    if(bitmap.width!==512||bitmap.height!==256)
      return {value:null,reason:"failed"};
    const sample=document.createElement("canvas");
    sample.width=256;sample.height=128;
    const ctx=sample.getContext("2d",{willReadFrequently:true});
    if(!ctx)return {value:null,reason:"failed"};
    ctx.drawImage(bitmap,0,0,256,128);
    const pixels=ctx.getImageData(0,0,256,128).data;
    const extent=estimateViirsPreviewExtent(pixels,256,128);
    if(extent.status==="insufficient-imagery")
      return {value:null,reason:"empty"};
    return {value:{info,sensor,daysAgo,
      visibleFraction:extent.visibleFraction,extent},reason:null};
  }finally{bitmap.close();}
}

function rankCandidate(a:Candidate,b:Candidate):number{
  // Prioritize substantial observed imagery over fabricated freshness.
  // A new date gets a small boost, but can never outweigh a useful image.
  const score=(v:Candidate)=>Math.min(v.visibleFraction,.9)-.018*v.daysAgo;
  return score(b)-score(a);
}
async function loadFullCandidate(
  item:Candidate, signal:AbortSignal,
):Promise<PreviewReady|null>{
  const args=new URLSearchParams({
    mode:"live",sensor:item.sensor,daysAgo:String(item.daysAgo),
  });
  const r=await fetch("/api/satellite?"+args,{signal,cache:"no-store"});
  if(!r.ok || !(r.headers.get("content-type")||"").startsWith("image/jpeg") ||
    r.headers.get("x-cupola-imagery-date")!==item.info.imageryDate ||
    r.headers.get("x-cupola-sensor")!==item.sensor ||
    !r.headers.get("x-cupola-source")?.includes(item.info.layer))return null;
  const blob=await r.blob();
  if(blob.size<25000||blob.size>16_000_000||signal.aborted)return null;
  const bitmap=await createImageBitmap(blob);
  try{
    if(bitmap.width!==2048||bitmap.height!==1024)return null;
    const crop=viirsFrameCrop(item.extent.bounds,bitmap.width,bitmap.height,4/3);
    const canvas=document.createElement("canvas");
    canvas.width=640;canvas.height=480;
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    if(!ctx)return null;
    ctx.fillStyle="#05090d";
    ctx.fillRect(0,0,640,480);
    ctx.drawImage(bitmap,crop.x,crop.y,crop.width,crop.height,0,0,640,480);
    // Recheck that the full resolution crop itself isn't black/no-data
    // (the fast GIBS probe and full image can be revised independently).
    const thumbnail=ctx.getImageData(0,0,640,480).data;
    const reduced=document.createElement("canvas");
    reduced.width=160;reduced.height=120;
    const reducedCtx=reduced.getContext("2d",{willReadFrequently:true});
    if(!reducedCtx)return null;
    reducedCtx.drawImage(canvas,0,0,160,120);
    const coverage=estimateViirsPreviewExtent(
      reducedCtx.getImageData(0,0,160,120).data,160,120);
    if(coverage.status==="insufficient-imagery")return null;
    return {...item,thumbnail:canvas.toDataURL("image/jpeg",.84)};
  }finally{bitmap.close();}
}

/** All three public VIIRS sensors, actual sampled coverage, day fallback,
 * then verified full-res retrieval. Never alter main Earth/Cloud V3.
 */
export default function SatelliteSurfacePreview(
  {onImagery}:{onImagery:(info:DailyImageryInfo|null)=>void},
){
  const [state,setState]=useState<PreviewState>({phase:"loading",checks:0});
  useEffect(()=>{
    let mounted=true,loading=false;
    const controller=new AbortController();
    const load=async()=>{
      if(!mounted||loading)return;
      loading=true;
      // Retain last known-good picture on short network outages.
      setState(old=>old.phase==="available"?old:{phase:"loading",checks:0});
      let checks=0,empty=0,failed=0;
      const candidates:Candidate[]=[];
      try{
        for(const days of [[1,0],[2,3],[4,5,6]]){
          // 2 date-scoped rounds × 3 sources first; broaden back to 6d only
          // when recent NASA GIBS daily swaths are genuinely missing.
          const combos=days.flatMap(daysAgo=>SENSORS.map(sensor=>({sensor,daysAgo})));
          const results=await Promise.allSettled(combos.map(
            ({sensor,daysAgo})=>readProbe(sensor,daysAgo,controller.signal)));
          for(const result of results){
            checks++;
            if(result.status==="rejected"){failed++;continue;}
            if(result.value.value)candidates.push(result.value.value);
            else if(result.value.reason==="empty")empty++;
            else failed++;
          }
          if(controller.signal.aborted||!mounted)return;
          if(candidates.some(c=>c.visibleFraction>=.045))break;
        }
        candidates.sort(rankCandidate);
        // If a chosen full-res WMS image is inconsistent/empty, fall back
        // to the next verified satellite, not an error/black preview.
        for(const item of candidates.slice(0,5)){
          const loaded=await loadFullCandidate(item,controller.signal).catch(()=>null);
          if(!mounted||controller.signal.aborted)return;
          if(loaded){
            onImagery(loaded.info);
            setState({phase:"available",image:loaded,checks});
            return;
          }
          failed++;
        }
        if(!mounted||controller.signal.aborted)return;
        onImagery(null);
        setState({phase:"unavailable",checks,empty,failed,
          reason:checks
            ? "NO VERIFIED RECENT VIIRS SWATH · NASA GIBS currently returned only unobserved or unusable daily images."
            : "VIIRS SOURCE NOT REACHABLE"});
      }catch{
        if(mounted&&!controller.signal.aborted){
          onImagery(null);
          setState({phase:"unavailable",checks,empty,failed,
            reason:"NASA GIBS REQUEST FAILED · The cinema Earth and Cloud V3 remain intact."});
        }
      }finally{loading=false;}
    };
    void load();
    const timer=window.setInterval(()=>void load(),30*60_000);
    return()=>{mounted=false;controller.abort();window.clearInterval(timer);onImagery(null);};
  },[onImagery]);

  if(state.phase==="loading")return(
    <div className="viirs-preview-state" role="status">
      <span className="viirs-preview-loading"/>
      SEARCHING VIIRS NOAA-21 / NOAA-20 / SNPP...
      <small>Sampling small daily scenes before downloading a full-resolution satellite pass.</small>
    </div>
  );
  if(state.phase==="unavailable")return(
    <div className="viirs-preview-state" role="status">
      {state.reason}
      <small>{state.checks} sensor/date probes · {state.empty} empty swaths · {state.failed} unavailable/invalid sources.</small>
      <small>NASA Worldview can show which geographic regions have actual observations today.</small>
      <a href={NASA_WORLDVIEW} target="_blank" rel="noopener noreferrer"
        className="viirs-preview-link">OPEN OFFICIAL NASA WORLDVIEW ↗</a>
    </div>
  );
  const {image}=state;
  const percent=Math.round(image.visibleFraction*100);
  const full="/api/satellite?mode=live&sensor="+image.sensor+"&daysAgo="+image.daysAgo;
  return(
    <>
      <a href={full} target="_blank" rel="noopener noreferrer"
        title="Open original VIIRS equirectangular image with unobserved areas">
        <img src={image.thumbnail}
          alt={"Actual observed NOAA/NASA VIIRS orbit swath, "+image.info.imageryDate}
          width={640} height={480}
          style={{width:"100%",maxHeight:250,aspectRatio:"4 / 3",
            display:"block",objectFit:"cover",borderRadius:9,background:"#060a12"}}/>
      </a>
      <div className="viirs-preview-metrics" aria-label="NASA VIIRS source coverage">
        <span>{image.info.imageryDate} · {image.sensor==="noaa21"?"NOAA-21":
          image.sensor==="noaa20"?"NOAA-20":"SUOMI NPP"}</span>
        <span>VISIBLE PIXELS ~{percent}%</span>
      </div>
      <p style={{fontSize:11,opacity:.82,margin:"8px 0 4px",lineHeight:1.5}}>
        NASA VIIRS · VERIFIED VISIBLE ORBIT SWATH
      </p>
      <p style={{fontSize:11,opacity:.63,margin:"0 0 7px",lineHeight:1.5}}>
        Chosen from {state.checks} satellite/date samples. This is a partial
        optical pass, not a cloud-free global surface. Pixel presence is a
        visual estimate, NOT a scientific QA cloud mask. CINEMA Earth and
        Cloud V3 are unchanged.
      </p>
      <a className="viirs-preview-link" href={full} target="_blank"
        rel="noopener noreferrer">VIEW UNALTERED NASA GIBS IMAGE ↗</a>
      <a className="viirs-preview-link" style={{display:"block"}}
        href={NASA_WORLDVIEW} target="_blank" rel="noopener noreferrer">
        EXPLORE SATELLITE PASSES IN NASA WORLDVIEW ↗</a>
    </>
  );
}
