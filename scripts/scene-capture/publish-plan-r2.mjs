#!/usr/bin/env node
/**
 * Run only in the protected, manually dispatched publication workflow.
 * Uses Wrangler CLI without shell interpolation and validates remote URLs.
 */
import fs from "node:fs";
import {spawnSync} from "node:child_process";
const file=process.argv[2]||"capture-output/publication-plan.json";
const plan=JSON.parse(fs.readFileSync(file,"utf8"));
const bucket=process.env.CUPOLA_R2_BUCKET||"";
if(!/^[a-z0-9][a-z0-9-]{2,62}$/.test(bucket))throw Error("Invalid/missing CUPOLA_R2_BUCKET");
if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID)
 throw Error("Cloudflare R2 publishing credentials missing");
if(plan.approved!==true||plan.mediaHost!=="media.cupola.earth"||
   !Array.isArray(plan.objects)||plan.objects.length<3||plan.objects.length>4)
 throw Error("Invalid or unapproved publication plan");
for(const object of plan.objects){
 if(!object.key.startsWith("scene-captures/"+plan.id+"/") ||
    !/^[a-z0-9/.-]+$/.test(object.key)||object.key.includes("..")||
    !["image/webp","video/webm","application/json"].includes(object.contentType)||
    !fs.existsSync(object.local))throw Error("Unsafe R2 object entry");
 const args=["wrangler","r2","object","put",bucket+"/"+object.key,
   "--remote","--file",object.local,"--content-type",object.contentType,
   "--cache-control","public, max-age=31536000, immutable"];
 const result=spawnSync("npx",args,{stdio:"inherit",encoding:"utf8",timeout:240000});
 if(result.status!==0)throw Error("R2 upload failed for "+object.key);
 console.log("R2_IMMUTABLE_ASSET_UPLOADED",object.key);
}
