#!/usr/bin/env node
// Render actual CUPOLA canvas only. These files are UNAPPROVED editor-ready
// evidence artifacts; this script never injects its output into the sitemap.
import fs from "node:fs/promises";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {chromium} from "playwright";
import sharp from "sharp";
import presets from "../../config/scene-capture-presets.json" with {type:"json"};

const name=process.argv[2]||"home-hero";
const requestedPage=String(process.env.CUPOLA_CAPTURE_PAGE||"").trim();
const captureType=String(process.env.CUPOLA_CAPTURE_TYPE||"still");
if(!["still","video"].includes(captureType))throw Error("Only still and video on-demand requests are supported");
const preset=presets.presets.find(p=>p.id===name);
if(!preset)throw Error("Capture preset is not allowlisted: "+name);
if(!requestedPage||requestedPage!==preset.pageId)throw Error("Capture page/preset mismatch; arbitrary scene commands are prohibited");
if(!preset.renderTypes?.includes(captureType))throw Error("Output type is not approved for requested scene preset");
const origin=process.env.CUPOLA_CAPTURE_ORIGIN||"https://cupola.earth";
const parsed=new URL(origin);
if(parsed.protocol!=="https:" || !["cupola.earth","www.cupola.earth"].includes(parsed.hostname))
  throw Error("Capture origin must be a verified CUPOLA host");
const dest=path.resolve(process.env.CUPOLA_CAPTURE_OUT||"capture-output");
await fs.mkdir(dest,{recursive:true});
const url=new URL(preset.route,origin).toString();
// Playwright saves an additional, randomly named raw recording by default.
// Keep it in a quarantined scratch folder, never in media artifacts or R2.
const scratchVideoDir=path.join(dest,".playwright-recording-"+process.pid);
if(captureType==="video")await fs.mkdir(scratchVideoDir,{recursive:true});
const browser=await chromium.launch({
  headless:true,
  args:["--enable-webgl","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--disable-dev-shm-usage"]
});
try{
  const page=await browser.newPage({
    viewport:{width:preset.width,height:preset.height},deviceScaleFactor:1,
    reducedMotion:"reduce",
    ...(captureType==="video"?{recordVideo:{dir:scratchVideoDir,size:{
      width:preset.width,height:preset.height}}}:{})
  });
  const failures=[];
  page.on("pageerror",e=>failures.push(e.message));
  const response=await page.goto(url,{waitUntil:"domcontentloaded",timeout:95000});
  if(!response || response.status()!==200)throw Error("CUPOLA scene HTTP not 200");
  await page.locator(".cupola-page.capture-scene canvas").waitFor({state:"visible",timeout:95000});
  await page.waitForFunction(()=>{
    const root=document.querySelector(".cupola-page.capture-scene");
    const canvas=root?.querySelector("canvas");
    return root?.getAttribute("data-renderer-ready")==="true" &&
      root?.getAttribute("data-renderer-type")==="CUPOLA_THREEJS_WEBGL" &&
      root?.getAttribute("data-observation-verified")==="false" &&
      canvas instanceof HTMLCanvasElement &&
      canvas.width>=800 && canvas.height>=450;
  },null,{timeout:70000,polling:500});
  if(preset.cameraMode==="editorial-dawn-realtime"){
    // A sky-only screenshot is not a sunrise globe, even if the WebGL
    // renderer reported ready. Require the actual scene camera to calculate
    // the same solar limb framing that the homepage uses.
    await page.waitForFunction(()=>{
      const root=document.querySelector(".cupola-page.capture-scene");
      const time=root?.getAttribute("data-solar-camera-utc");
      const margin=Number(root?.getAttribute("data-sun-limb-separation-deg"));
      const clipX=Number(root?.getAttribute("data-sun-projection-x"));
      const clipY=Number(root?.getAttribute("data-sun-projection-y"));
      return root?.getAttribute("data-editorial-camera")==="sunrise-limb-v1" &&
        root?.getAttribute("data-sun-visible-in-frustum")==="true" &&
        Number.isFinite(clipX)&&clipX>0&&clipX<.98 &&
        Number.isFinite(clipY)&&clipY>0&&clipY<.98 &&
        Number.isFinite(Date.parse(time||"")) &&
        Number.isFinite(margin) && margin>20 && margin<40;
    },null,{timeout:70000,polling:500});
  }
  if(preset.cameraMode==="editorial-wide-clouds"){
    // The wide shot deliberately moves the Sun outside the camera frustum
    // to preserve a fully recognizable globe. It must not be judged using
    // the sunrise hero's requirement for a visible solar disk.
    await page.waitForFunction(()=>{
      const root=document.querySelector(".cupola-page.capture-scene");
      const dist=Number(root?.getAttribute("data-earth-distance-radii"));
      const limb=Number(root?.getAttribute("data-earth-limb-angle-deg"));
      const centerX=Number(root?.getAttribute("data-earth-center-projection-x"));
      const centerY=Number(root?.getAttribute("data-earth-center-projection-y"));
      const daylight=Number(root?.getAttribute("data-daylight-fraction-approx"));
      return root?.getAttribute("data-editorial-camera")==="sunrise-limb-v1" &&
        root?.getAttribute("data-editorial-shot")==="wide" &&
        dist>=4.12 && dist<=4.18 && limb>=13 && limb<=15 &&
        Math.abs(centerX)<0.50 && Math.abs(centerY)<0.50 &&
        daylight>=0.64 && daylight<=0.72 &&
        Number.isFinite(Date.parse(root.getAttribute("data-solar-camera-utc")||""));
    },null,{timeout:70000,polling:500});
  }
  if(preset.cameraMode==="explore-reference"){
    // Read the stable camera evidence produced from Scene.useFrame after
    // OrbitControls settles; never accept Canvas.onCreated's un-aimed pose.
    // A camera mismatch is diagnosed, not "fixed" by a guessed rotation.
    try{
      await page.waitForFunction(()=>{
        const root=document.querySelector(".cupola-page.capture-scene");
        const dist=Number(root?.getAttribute("data-earth-distance-radii"));
        const fov=Number(root?.getAttribute("data-editorial-fov-degrees"));
        const utc=root?.getAttribute("data-solar-camera-utc");
        const x=Number(root?.getAttribute("data-earth-center-projection-x"));
        const y=Number(root?.getAttribute("data-earth-center-projection-y"));
        const stable=Number(root?.getAttribute("data-capture-probe-stable-frames"));
        return root?.getAttribute("data-capture-pose-stable")==="true" &&
          stable>=12 &&
          root?.getAttribute("data-editorial-camera")==="explore-reference-v1" &&
          root?.getAttribute("data-editorial-shot")==="explore" &&
          root?.getAttribute("data-capture-shader-profile")==="EXPLORE_UNMODIFIED" &&
          dist>=3.65&&dist<=3.78&&fov>=40.5&&fov<=41.5&&
          Math.abs(x)<.2&&Math.abs(y)<.2&&
          Number.isFinite(Date.parse(utc||""));
      },null,{timeout:90000,polling:350});
    }catch(error){
      const observation=await page.locator(".cupola-page.capture-scene")
        .evaluate(root=>{
          const fields=["data-renderer-ready","data-editorial-camera",
            "data-editorial-shot","data-capture-shader-profile",
            "data-capture-pose-stable","data-capture-probe-stable-frames",
            "data-capture-probe-distance","data-capture-probe-center-x",
            "data-capture-probe-center-y","data-capture-probe-position-error",
            "data-capture-probe-target-error","data-cloud-source-mode",
            "data-cloud-gpu-applied-kind"];
          return Object.fromEntries(fields.map(field=>[field,root.getAttribute(field)]));
        }).catch(e=>({diagnosticError:String(e)}));
      const diagnostics={status:"CAMERA_NOT_STABLE_NO_PUBLICATION",
        message:String(error),capturedAt:new Date().toISOString(),
        actualBrowserCamera:observation};
      await fs.writeFile(path.join(dest,"explore-camera-diagnostics.json"),
        JSON.stringify(diagnostics,null,2)+"\n");
      throw Error("Actual Explore pose never reached 12 stable frames: "+
        JSON.stringify(observation));
    }
    console.log("CUPOLA_EXPLORE_REFERENCE_POSE_STABLE_12_FRAMES",url);
  }
  // Captures tagged as actual satellite-observed WebP MUST fail closed.
  // A healthy manifest on the server is insufficient: require its actual
  // application to the running Three.js cloud shader on this GPU.
  const strictlyObserved=process.env.CUPOLA_REQUIRE_SCIENCE_READY==="1";
  const observedGpuReady=await page.waitForFunction(()=>{
    const root=document.querySelector(".cupola-page.capture-scene");
    return root?.getAttribute("data-cloud-source-mode")==="observed" &&
      root?.getAttribute("data-cloud-gpu-applied-kind")==="verified-l2" &&
      !!root?.getAttribute("data-cloud-source-observed-at") &&
      !!root?.getAttribute("data-cloud-gpu-version");
  },null,{timeout:strictlyObserved?300000:25000,polling:1000})
    .then(()=>true).catch(()=>false);
  console.log("CUPOLA_CLOUD_GPU_OBSERVED_AT_CAPTURE",observedGpuReady);
  if(strictlyObserved&&!observedGpuReady){
    const diagnostic=await page.locator(".cupola-page.capture-scene").evaluate(root=>{
      const fields=["data-cloud-source-mode","data-cloud-source-observed-at",
        "data-cloud-observation-footprint","data-cloud-gpu-applied-kind",
        "data-cloud-gpu-applied-at","data-cloud-gpu-version",
        "data-capture-pose-stable","data-renderer-ready"];
      return Object.fromEntries(fields.map(k=>[k,root.getAttribute(k)]));
    }).catch(e=>({diagnosticError:String(e)}));
    await fs.writeFile(path.join(dest,"cloud-v3-gpu-diagnostics.json"),
      JSON.stringify({status:"SCIENTIFIC_L2_NOT_ON_GPU_NO_PUBLICATION",
        captureAt:new Date().toISOString(),diagnostic},null,2)+"\n");
    throw Error("CUPOLA_CAPTURE_BLOCKED: fresh Level-2 was not applied on GPU; "+
      JSON.stringify(diagnostic));
  }
  // Buffer for real textures/NOAA layer sources, but never call this
  // proof of scientific observation. Scientific review stays separate.
  await page.waitForTimeout(10000);
  const canvas=page.locator(".cupola-page.capture-scene canvas");
  if(await page.locator(".cupola-page.capture-scene [data-scene-error]").count()>0)
    throw Error("CUPOLA scene reports a rendering failure");
  const box=await canvas.boundingBox();
  if(!box || box.width<800 || box.height<450)throw Error("Scene canvas has invalid dimensions");
  // Direct compositor capture is the proven working path for this
  // continuously animated SwiftShader scene. The Playwright screenshot
  // previously hit a deterministic 65s timeout before falling back to CDP.
  // Try CDP first; retain Playwright as a safe recovery path.
  let png;
  const session=await page.context().newCDPSession(page);
  try {
    const frame=await session.send("Page.captureScreenshot",{
      format:"png",fromSurface:true,captureBeyondViewport:false
    });
    if(!frame?.data)throw Error("CDP returned no screenshot data");
    png=Buffer.from(frame.data,"base64");
    console.log("CAPTURE_FRAME CDP original 3D viewport",png.length);
  } catch(cdpError) {
    console.warn("CAPTURE_FRAME CDP unavailable; trying animated Playwright screenshot",
      String(cdpError).slice(0,350));
    png=await page.screenshot({type:"png",animations:"allow",timeout:65000});
    console.log("CAPTURE_FRAME Playwright animated WebGL screenshot",png.length);
  } finally {
    await session.detach().catch(()=>{});
  }
  if(!png || png.length<10000 || !png.subarray(0,8)
    .equals(Buffer.from([137,80,78,71,13,10,26,10])))
    throw Error("Invalid or blank Chromium PNG screenshot");
  const dimensions=await sharp(png).metadata();
  if(dimensions.width!==preset.width||dimensions.height!==preset.height)
    throw Error("Unexpected original scene screenshot dimensions: "+
      dimensions.width+"x"+dimensions.height);
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
  const cameraEvidence=await page.locator(".cupola-page.capture-scene")
    .evaluate(root=>({
      cameraMode:root.getAttribute("data-editorial-camera")||null,
      captureShaderProfile:root.getAttribute("data-capture-shader-profile")||null,
      poseStable:root.getAttribute("data-capture-pose-stable")==="true",
      stableFrames:Number(root.getAttribute("data-capture-probe-stable-frames")||0),
      positionError:Number(root.getAttribute("data-capture-probe-position-error")||999),
      targetError:Number(root.getAttribute("data-capture-probe-target-error")||999),
      verticalFovDegrees:Number(root.getAttribute("data-editorial-fov-degrees")||0),
      shot:root.getAttribute("data-editorial-shot")||null,
      earthDistanceRadii:Number(root.getAttribute("data-earth-distance-radii")||0),
      earthLimbAngleDegrees:Number(root.getAttribute("data-earth-limb-angle-deg")||0),
      earthCenterClipX:Number(root.getAttribute("data-earth-center-projection-x")||0),
      earthCenterClipY:Number(root.getAttribute("data-earth-center-projection-y")||0),
      daylightFractionApprox:Number(root.getAttribute("data-daylight-fraction-approx")||0),
      utcSolarFrame:root.getAttribute("data-solar-camera-utc")||null,
      sunCenterSeparationDegrees:root.getAttribute("data-sun-limb-separation-deg")||null,
      sunProjectionX:root.getAttribute("data-sun-projection-x")||null,
      sunProjectionY:root.getAttribute("data-sun-projection-y")||null,
      solarDiscInsideFrustum:root.getAttribute("data-sun-visible-in-frustum")==="true",
      renderer:root.getAttribute("data-renderer-type")||null,
      classification:root.getAttribute("data-scene-frame-type")||"3D_VISUALIZATION"
    }));
  // The requesting GitHub commit is NOT proof that the remote Cloudflare
  // deployment was built from the same revision. Do not forge provenance.
  const deployedRevision=((await response.allHeaders())["x-cupola-revision"] || (await response.allHeaders())["x-deployment-revision"] || "").trim();
  const validatedDeployedRevision=/^[a-f0-9]{40}$/.test(deployedRevision) ? deployedRevision : null;
  const cloudEvidence=await page.locator(".cupola-page.capture-scene")
    .evaluate(root=>({
      mode:root.getAttribute("data-cloud-source-mode")||"unreported",
      observedAt:root.getAttribute("data-cloud-source-observed-at")||null,
      footprint:Number(root.getAttribute("data-cloud-observation-footprint")||0),
      gpuAppliedKind:root.getAttribute("data-cloud-gpu-applied-kind")||"not-verified",
      gpuAppliedAt:root.getAttribute("data-cloud-gpu-applied-at")||null,
      gpuAtlasVersion:root.getAttribute("data-cloud-gpu-version")||null
    }));
  let videoBytes=null, videoDurationSeconds=null, videoSha256=null;
  if(captureType==="video"){
    // A video request is an opt-in record of the CURRENT 3D renderer.
    // This is a simulation clip, not eight seconds of satellite acquisition.
    const clip=page.video();
    if(!clip)throw Error("Playwright WebGL video recorder not initialized");
    await page.waitForTimeout(8000);
    await page.close();
    // Playwright's recorder runs from page creation, including initialization.
    // Trim the last 8 seconds of the READY scene; never label a 20-second
    // initialization recording as an 8-second cinematic film.
    const rawOutput=path.join(scratchVideoDir,preset.output+"-untrimmed.webm");
    const videoOutput=prefix+"-8s.webm";
    await clip.saveAs(rawOutput);
    execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-y",
      "-sseof","-8","-i",rawOutput,"-t","8","-an",
      "-c:v","libvpx","-deadline","realtime","-cpu-used","5",
      "-b:v","1800k",videoOutput],{timeout:360000,stdio:"pipe"});
    const duration=Number(execFileSync("ffprobe",["-v","error","-show_entries",
      "format=duration","-of","default=noprint_wrappers=1:nokey=1",videoOutput],
      {encoding:"utf8"}).trim());
    if(!Number.isFinite(duration)||duration<7.5||duration>8.25)
      throw Error("8-second WebM output duration invalid: "+duration);
    videoDurationSeconds=duration;
    await fs.unlink(rawOutput);
    videoBytes=(await fs.stat(videoOutput)).size;
    videoSha256=createHash("sha256").update(await fs.readFile(videoOutput)).digest("hex");
    if(videoBytes<30_000)throw Error("Requested video is blank or corrupt");
  }
  const stamp=new Date().toISOString();
  const meta={
    schemaVersion:1,preset:name,pageId:requestedPage,
    requestType:captureType,trigger:"GITHUB_WORKFLOW_DISPATCH_AUTHORIZED",
    captureUrl:url,
    assetStatus:"AWAITING_EDITORIAL_AND_SCIENCE_REVIEW",approved:false,
    imageType:"CUPOLA_3D_RENDER_NOT_A_SATELLITE_PHOTOGRAPH",
    renderedAt:stamp,sourceObservedAt:null,
    basemapVintage:"MIXED / MAY INCLUDE HISTORICAL NASA IMAGERY",
    sourceFreshness:"UNVERIFIED_CAPTURE_ONLY",
    sourceStatus:"UNKNOWN_NOT_ASSESSED",
    cloudSourceEvidence:cloudEvidence,
    scientificClassification:"RENDERED_3D_SCENE_WITH_MIXED_OBSERVATION_AGES",
    sceneReadyVerified:true,
    actualThreeJsCanvas:true,
    approvalConditions:["verify actual Cloudflare deployment commit matches original scene code","validate layer observation provenance","review captured geography and pixels","verify scene image contains valid non-placeholder Earth","upload immutable asset to CUPOLA R2","register independent editorial approval"],
    reason:"Do not assign a specific NOAA observation time without joining authoritative source-state metadata from the scene",
    requestRevision:process.env.GITHUB_SHA||null,
    sceneRevision:validatedDeployedRevision,
    revisionStatus:validatedDeployedRevision?"REMOTE_REVISION_HEADER_VERIFIED":"REMOTE_DEPLOYMENT_SHA_UNVERIFIED",
    actualSceneCameraEvidence:cameraEvidence,
    viewport:{width:preset.width,height:preset.height},og:{width:preset.ogWidth,height:preset.ogHeight},
    heroSha256:createHash("sha256").update(hero).digest("hex"),
    ogSha256:createHash("sha256").update(og).digest("hex"),
    video:captureType==="video"?{filename:preset.output+"-8s.webm",sizeBytes:videoBytes,durationSeconds:videoDurationSeconds,
      classification:"CUPOLA_3D_SCENE_SIMULATION_NOT_OBSERVED_TIMELAPSE",sha256:videoSha256}:null,
    contrastStdev:contrast.map(n=>Math.round(n*100)/100),
    warnings:failures.slice(0,10)
  };
  await fs.writeFile(prefix+".json",JSON.stringify(meta,null,2)+"\n");
  console.log("UNAPPROVED_ON_DEMAND_SCENE_CAPTURE",requestedPage,name,captureType,hero.length,"B",og.length,"B",videoBytes??"no video",stamp);
}catch(error){
  // Preserve enough evidence to diagnose a failed production WebGL capture.
  // No media is published when an error occurs.
  const diagnostic={
    preset:name,pageId:requestedPage,captureUrl:url,requestedAt:new Date().toISOString(),
    status:"CAPTURE_FAILED_NOT_PUBLISHED",error:String(error),
    requestRevision:process.env.GITHUB_SHA||null
  };
  await fs.writeFile(path.join(dest,name+"-capture-error.json"),
    JSON.stringify(diagnostic,null,2)+"\n").catch(()=>{});
  throw error;
}finally{
  try{await browser.close();}
  finally{if(captureType==="video")await fs.rm(scratchVideoDir,{recursive:true,force:true});}
}
