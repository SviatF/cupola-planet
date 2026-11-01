import {NextResponse} from "next/server";
import {getCloudflareContext} from "@opennextjs/cloudflare";

export const dynamic="force-dynamic";
// Origin storage is a private Cloudflare R2 binding; no public R2 domain/CORS required.
type R2Read={get:(key:string)=>Promise<{text:()=>Promise<string>}|null>};
async function homeBucket():Promise<R2Read>{
 const context=await getCloudflareContext({async:true});
 const bucket=(context.env as unknown as {CUPOLA_SCENE_MEDIA?:R2Read}).CUPOLA_SCENE_MEDIA;
 if(!bucket||typeof bucket.get!=="function")throw Error("CUPOLA_SCENE_MEDIA binding missing");
 return bucket;
}
const prefix="scene-captures/home-cover/";
const version=/^[a-f0-9]{20}$/;
const sha40=/^[a-f0-9]{40}$/;
const sha64=/^[a-f0-9]{64}$/;
function validDate(value:unknown):value is string{
 return typeof value==="string" && /^\d{4}-\d\d-\d\dT/.test(value) &&
  Number.isFinite(Date.parse(value));
}
function validHomePointer(data:unknown):data is {
 url:string;renderedAt:string;sourceObservedAt:string;observedFootprint:number
}{
 if(!data||typeof data!=="object")return false;
 const p=data as Record<string,unknown>;
 if(p.schemaVersion!==1||p.assetId!=="home-cover"||
    p.status!=="AUTO_QA_PASSED"||p.origin!=="CUPOLA_CAPTURE_ENGINE"||
    p.imageType!=="CUPOLA_3D_RENDER_NOT_A_SATELLITE_PHOTOGRAPH")return false;
 if(typeof p.heroSha256!=="string" || !sha64.test(p.heroSha256) ||
    typeof p.sceneRevision!=="string"||!sha40.test(p.sceneRevision) ||
    !validDate(p.renderedAt)||!validDate(p.sourceObservedAt) ||
    typeof p.observedFootprint!=="number" ||
    p.observedFootprint<.45||p.observedFootprint>1)return false;
 const v=p.heroSha256.slice(0,20);
 if(!version.test(v) || p.url!=="/api/scene-media/home-cover/image?v="+v ||
    p.manifestKey!==prefix+v+"/manifest.json")return false;
 const t=Date.parse(p.renderedAt),o=Date.parse(p.sourceObservedAt);
 return o<=t+300000 && t-o>=-300000 && t-o<=90*60000 &&
  t<=Date.now()+300000;
}
export async function GET(){
 try{
  const bucket=await homeBucket();
  const pointer=await bucket.get(prefix+"current.json");
  if(!pointer)throw Error("No published WebP");
  const body=await pointer.text();
  if(body.length>4096)throw Error("Oversized pointer");
  const parsed:unknown=JSON.parse(body);
  if(!validHomePointer(parsed))throw Error("Invalid source provenance");
  return NextResponse.json({
   url:parsed.url,renderedAt:parsed.renderedAt,
   sourceObservedAt:parsed.sourceObservedAt,observedFootprint:parsed.observedFootprint
  },{headers:{"Cache-Control":"public, max-age=30, s-maxage=60"}});
 }catch{
  return NextResponse.json({status:"no-verified-home-cover"},{status:503,
   headers:{"Cache-Control":"no-store"}});
 }
}
