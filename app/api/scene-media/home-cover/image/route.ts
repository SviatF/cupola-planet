import {getCloudflareContext} from "@opennextjs/cloudflare";
export const dynamic="force-dynamic";
type R2Image={body:ReadableStream<Uint8Array>;size:number;httpEtag?:string};
type Bucket={get:(key:string)=>Promise<R2Image|null>};
export async function GET(request:Request){
 const version=new URL(request.url).searchParams.get("v");
 if(!version||!/^[a-f0-9]{20}$/.test(version))
  return new Response("Invalid image version",{status:400});
 try{
  const {env}=await getCloudflareContext({async:true});
  const bucket=(env as unknown as {CUPOLA_SCENE_MEDIA?:Bucket}).CUPOLA_SCENE_MEDIA;
  if(!bucket)throw Error("R2 missing");
  const asset=await bucket.get("scene-captures/home-cover/"+version+"/home-cover.webp");
  if(!asset)return new Response("Not found",{status:404,headers:{"Cache-Control":"no-store"}});
  const headers=new Headers({"Content-Type":"image/webp",
   "Cache-Control":"public, max-age=31536000, immutable",
   "X-Content-Type-Options":"nosniff"});
  if(asset.httpEtag)headers.set("ETag",asset.httpEtag);
  return new Response(asset.body,{headers});
 }catch{
  return new Response("Image temporarily unavailable",{status:503,
   headers:{"Cache-Control":"no-store"}});
 }
}
