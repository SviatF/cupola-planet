"use client";
import {useEffect,useState} from "react";

type HomeStill={url:string;renderedAt:string;sourceObservedAt?:string;observedFootprint?:number};
const safeUrl=/^\/api\/scene-media\/home-cover\/image\?v=[a-f0-9]{20}$/;
const defaultAlt="Original CUPOLA 3D visualization of Earth using regionally observed satellite clouds and computed solar lighting, not a live satellite photograph";
export function HomeHeroMedia({initial}: {initial:HomeStill|null}){
 const [still,setStill]=useState<HomeStill|null>(initial);
 useEffect(()=>{
  let active=true;
  let requestActive=false;
  let loadedAt=initial?.renderedAt||"";
  const refresh=async()=>{
   if(requestActive||!active)return;
   requestActive=true;
   try{
    const response=await fetch("/api/scene-media/home-cover",{cache:"no-store"});
    if(!response.ok)return;
    const data:HomeStill=await response.json();
    if(!data || typeof data.url!=="string" || !safeUrl.test(data.url) ||
       !Number.isFinite(Date.parse(data.renderedAt)) ||
       (loadedAt && Date.parse(data.renderedAt)<=Date.parse(loadedAt)))return;
    // Do not remove the last good image while the new immutable WebP loads.
    const next=new Image();
    next.onload=()=>{
      if(active && (!loadedAt || Date.parse(data.renderedAt)>Date.parse(loadedAt))){
       loadedAt=data.renderedAt;setStill(data);
      }
    };
    next.onerror=()=>{};
    next.src=data.url;
   }catch{
    // Keep the last successfully loaded original CUPOLA image.
   }finally{requestActive=false;}
  };
  void refresh();
  const interval=window.setInterval(()=>{void refresh();},180000);
  const onVisible=()=>{if(document.visibilityState==="visible")void refresh();};
  document.addEventListener("visibilitychange",onVisible);
  return ()=>{active=false;window.clearInterval(interval);document.removeEventListener("visibilitychange",onVisible);};
 },[initial?.renderedAt,initial?.url]);
 return <div className={"ae-live-scene"+(still?" ae-live-scene--poster":"")} 
   aria-label={still?"Verified source-labelled CUPOLA 3D Earth image":"CUPOLA image awaiting science verification"}>
   {still?
     <>
       {/* A second view of the exact SAME cached R2 WebP supplies ambient color
           behind copy; the scientific foreground image stays completely sharp. */}
       <img className="ae-home-ambient-poster" src={still.url} alt=""
         aria-hidden="true" decoding="async" />
       <img className="ae-home-approved-poster" src={still.url} alt={defaultAlt}
         fetchPriority="high" decoding="async" />
     </>:
     <div className="ae-home-still-fallback" role="img"
       aria-label="CUPOLA Earth image temporarily unavailable pending science verification" />}
   <div className="ae-hero-shade"/>
   {still?
     <span className="ae-render-badge ae-poster-badge">
       CUPOLA 3D · VERIFIED CLOUD SOURCES · CAPTURED {new Date(still.renderedAt).toISOString().slice(0,16).replace("T"," ")} UTC
     </span>:
     <span className="ae-render-badge">CUPOLA SCIENCE CAPTURE PENDING</span>}
 </div>;
}
