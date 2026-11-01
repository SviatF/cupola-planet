import {NextResponse} from "next/server";

// The public hero is a pointer to the most recent QA-passed, immutable R2 WebP.
// Fetching server-side avoids a browser CORS dependency on media.cupola.earth.
export const dynamic = "force-dynamic";
const pointerUrl="https://media.cupola.earth/scene-captures/home-cover/current.json";
const imagePattern=/^https:\/\/media\.cupola\.earth\/scene-captures\/home-cover\/[a-f0-9]{20}\/home-cover\.webp$/;
const manifestPattern=/^https:\/\/media\.cupola\.earth\/scene-captures\/home-cover\/[a-f0-9]{20}\/manifest\.json$/;
const sha40=/^[a-f0-9]{40}$/;
const sha64=/^[a-f0-9]{64}$/;
function validIso(value:unknown):value is string {
 return typeof value==="string" && Number.isFinite(Date.parse(value)) &&
  /^\d{4}-\d{2}-\d{2}T/.test(value);
}
export function validHomePointer(data:unknown):data is {
 url:string;manifestUrl:string;renderedAt:string;sourceObservedAt:string;
 sceneRevision:string;heroSha256:string;observedFootprint:number;
} {
 if(!data || typeof data!=="object")return false;
 const p=data as Record<string,unknown>;
 if(p.schemaVersion!==1 || p.assetId!=="home-cover" ||
    p.status!=="AUTO_QA_PASSED" || p.origin!=="CUPOLA_CAPTURE_ENGINE" ||
    p.imageType!=="CUPOLA_3D_RENDER_NOT_A_SATELLITE_PHOTOGRAPH")return false;
 if(typeof p.url!=="string" || !imagePattern.test(p.url) ||
    typeof p.manifestUrl!=="string" || !manifestPattern.test(p.manifestUrl) ||
    !sha40.test(String(p.sceneRevision||"")) || !sha64.test(String(p.heroSha256||"")) ||
    !validIso(p.renderedAt) || !validIso(p.sourceObservedAt))return false;
 if(typeof p.observedFootprint!=="number" ||
    p.observedFootprint<0.45 || p.observedFootprint>1)return false;
 const capture=Date.parse(p.renderedAt),observation=Date.parse(p.sourceObservedAt);
 if(observation>capture+300000 || capture-observation>90*60000 ||
    capture>Date.now()+5*60000)return false;
 // The immutable version directory must be derived from the actual WebP hash.
 return p.url.includes("/"+String(p.heroSha256).slice(0,20)+"/") &&
    p.manifestUrl.includes("/"+String(p.heroSha256).slice(0,20)+"/");
}
export async function GET(){
 try{
  const response=await fetch(pointerUrl,{
   headers:{accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw Error("R2 pointer unavailable");
  const body=await response.text();
  if(body.length>4096)throw Error("R2 pointer oversized");
  const parsed:unknown=JSON.parse(body);
  if(!validHomePointer(parsed))throw Error("R2 pointer failed provenance QA");
  return NextResponse.json({
   url:parsed.url,renderedAt:parsed.renderedAt,
   sourceObservedAt:parsed.sourceObservedAt,observedFootprint:parsed.observedFootprint
  },{headers:{"Cache-Control":"public, max-age=30, s-maxage=90, stale-while-revalidate=120"}});
 }catch{
  // Never substitute an unverified or guessed image.
  return NextResponse.json({status:"no-verified-home-cover"},{status:503,
   headers:{"Cache-Control":"no-store"}});
 }
}
