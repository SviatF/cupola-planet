#!/usr/bin/env node
// Render actual CUPOLA canvas only. These files are UNAPPROVED editor-ready
// evidence artifacts; this script never injects its output into the sitemap.
import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {chromium} from "playwright";
import sharp from "sharp";
import presets from "../../config/scene-capture-presets.json" with {type:"json"};

const name=process.argv[2]||"home-hero";
const preset=presets.presets.find(p=>p.id===name);
if(!preset)throw Error("Capture preset is not allowlisted: "+name);
const origin=process.env.CUPOLA_CAPTURE_ORIGIN||"https://cupola.earth";
const parsed=new URL(origin);
if(parsed.protocol!=="https:" || !["cupola.earth","www.cupola.earth"].includes(parsed.hostname))
  throw Error("Capture origin must be a verified CUPOLA host");
const dest=path.resolve(process.env.CUPOLA_CAPTURE_OUT||"capture-output");
await fs.mkdir(dest,{recursive:true});
const url=new URL(preset.route,origin).toString();
const browser=await chromium.launch({
  headless:true,
  args:["--enable-webgl","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--disable-dev-shm-usage"]
});
try{
  const page=await browser.newPage({viewport:{width:preset.width,height:preset.height},deviceScaleFactor:1, reducedMotion:"reduce"});
  const failures=[];
  page.on("pageerror",e=>failures.push(e.message));
  const response=await page.goto(url,{waitUntil:"domcontentloaded",timeout:95000});
  if(!response || response.status()!==200)throw Error("CUPOLA scene HTTP not 200");
  await page.locator(".cupola-page.capture-scene canvas").waitFor({state:"visible",timeout:95000});
  await page.waitForFunction(()=>{
    const canvas=document.querySelector(".cupola-page.capture-scene canvas");
    return canvas instanceof HTMLCanvasElement &&
      canvas.width>=800 && canvas.height>=450 &&
      !!canvas.getContext("webgl2") || false;
  },null,{timeout:30000,polling:500});
  // Buffer for real textures/NOAA layer sources, but never call this
  // proof of scientific observation. Scientific review stays separate.
  await page.waitForTimeout(10000);
  const canvas=page.locator(".cupola-page.capture-scene canvas");
  const box=await canvas.boundingBox();
  if(!box || box.width<800 || box.height<450)throw Error("Scene canvas has invalid dimensions");
  const png=await page.screenshot({type:"png",animations:"disabled",timeout:30000});
  const scene=sharp(png,{limitInputPixels:18_000_000});
  const stats=await scene.stats();
  const contrast=stats.channels.slice(0,3).map(x=>x.stdev);
  if(contrast.every(x=>x<8))throw Error("Scene capture is blank or nearly uniform");
  if(failures.some(x=>/WebGL context lost|THREE\.WebGLRenderer: Error/i.test(x)))
    throw Error("WebGL renderer failed: "+failures.slice(0,3).join("; "));
  const hero=await sharp(png).webp({quality:88,effort:5}).toBuffer();
  const og=await sharp(png).resize(preset.ogWidth,preset.ogHeight,{fit:"cover",position:"centre"})
    .webp({quality:85,effort:5}).toBuffer();
  const prefix=path.join(dest,preset.output);
  await Promise.all([fs.writeFile(prefix+".webp",hero),fs.writeFile(prefix+"-og.webp",og)]);
  const stamp=new Date().toISOString();
  const meta={
    schemaVersion:1,preset:name,captureUrl:url,
    assetStatus:"AWAITING_EDITORIAL_AND_SCIENCE_REVIEW",approved:false,
    imageType:"CUPOLA_3D_RENDER_NOT_A_SATELLITE_PHOTOGRAPH",
    renderedAt:stamp,sourceObservedAt:null,
    basemapVintage:"MIXED / MAY INCLUDE HISTORICAL NASA IMAGERY",
    sourceFreshness:"UNVERIFIED_CAPTURE_ONLY",
    sourceStatus:"UNKNOWN_NOT_ASSESSED",
    reason:"Do not assign a specific NOAA observation time without joining authoritative source-state metadata from the scene",
    sceneRevision:process.env.GITHUB_SHA||"unresolved",
    viewport:{width:preset.width,height:preset.height},og:{width:preset.ogWidth,height:preset.ogHeight},
    heroSha256:createHash("sha256").update(hero).digest("hex"),
    ogSha256:createHash("sha256").update(og).digest("hex"),
    contrastStdev:contrast.map(n=>Math.round(n*100)/100),
    warnings:failures.slice(0,10)
  };
  await fs.writeFile(prefix+".json",JSON.stringify(meta,null,2)+"\n");
  console.log("UNAPPROVED_SCENE_CAPTURE",name,hero.length,"B",og.length,"B",stamp);
}finally{await browser.close();}
