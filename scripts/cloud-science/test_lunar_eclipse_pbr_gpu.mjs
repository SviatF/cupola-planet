#!/usr/bin/env node
/**
 * CUPOLA 4.1: isolated REAL Three.js MeshStandardMaterial lunar eclipse QA.
 * Tests the production onBeforeCompile injections in the complete PBR shader,
 * independent of the current date, Cloudflare network and browser HUD.
 * Synthetic grayscale Moon only; NASA LROC texture fidelity is covered by
 * separate deployed Browser QA and must still receive screenshot review.
 */
import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {chromium}=require("/tmp/cupola-eclipse-gpu/node_modules/playwright");
const esbuild=require("/tmp/cupola-eclipse-gpu/node_modules/esbuild");
const source=readFileSync("lib/earth/moonEclipseShader.ts","utf8");
const fragment=source.match(/export const MOON_ECLIPSE_FRAGMENT=[\s\S]*?`([\s\S]*?)`;/)?.[1];
const outgoing=source.match(/export const MOON_ECLIPSE_OUTGOING_LIGHT=[\s\S]*?`([\s\S]*?)`;/)?.[1];
const earthshine=source.match(/export const MOON_EARTHSHINE_OUTGOING_LIGHT=[\s\S]*?`([\s\S]*?)`;/)?.[1];
const vertexDecl=source.match(/export const MOON_ECLIPSE_VERTEX_DECL="([^"]+)"/)?.[1];
const vertexPosition=source.match(/export const MOON_ECLIPSE_VERTEX_POSITION=\s*"([^"]+)"/)?.[1];
assert.ok(fragment&&outgoing&&earthshine&&vertexDecl&&vertexPosition,"Missing real PBR and Earthshine injection");
const bundle=await esbuild.build({
  stdin:{contents:'import * as THREE from "three"; window.CUPOLA_THREE_TEST=THREE;',
    resolveDir:"/tmp/cupola-eclipse-gpu",sourcefile:"cupola-entry.js"},
  bundle:true,write:false,platform:"browser",format:"iife",logLevel:"silent",
});
const browser=await chromium.launch({headless:true,args:[
  "--no-sandbox","--enable-webgl","--use-gl=angle","--use-angle=swiftshader"
]});
const outDir="eclipse-gpu-evidence";mkdirSync(outDir,{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:256,height:256}});
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("console",m=>{
    if(m.type()==="error" || /THREE.WebGLProgram|Shader Error|ERROR: 0:/i.test(m.text()))
      errors.push(m.text());
  });
  await page.setContent('<html><body style="margin:0;background:black">'+
    '<canvas id="moon" width="256" height="256"></canvas></body></html>');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const output=await page.evaluate(({vertexDecl,vertexPosition,fragment,outgoing})=>{
    const THREE=window.CUPOLA_THREE_TEST;
    if(!THREE?.MeshStandardMaterial)throw Error("Real Three.js PBR library unavailable");
    const canvas=document.getElementById("moon");
    const renderer=new THREE.WebGLRenderer({
      canvas,antialias:false,preserveDrawingBuffer:true,alpha:false
    });
    renderer.setSize(256,256,false);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.NoToneMapping;
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(30,1,10,15000);
    camera.position.set(-7000,0,0);camera.up.set(0,1,0);
    camera.lookAt(0,0,0);
    const sun=new THREE.DirectionalLight(0xffffff,2.7);
    sun.position.set(-10000,0,0);scene.add(sun);
    scene.add(new THREE.AmbientLight(0xffffff,0.08));
    const uniforms={
      uEclipseEarthWorld:{value:new THREE.Vector3(-384400,0,0)},
      uEclipseApparentOffset:{value:new THREE.Vector3(0,0,0)},
      uEclipseActive:{value:0},
      uEclipseSunDirection:{value:new THREE.Vector3(-1,0,0)},
      uEclipseEarthRadius:{value:6371},
      uEclipseSolarAngularRadius:{value:Math.asin(695700/150000000)},
      uEclipseDanjonOffset:{value:0},
      uEarthshineMoonCenterWorld:{value:new THREE.Vector3(0,0,0)},
      uEarthshineIrradianceRatio:{value:0}
    };
    const material=new THREE.MeshStandardMaterial({
      color:0xbec3c7,roughness:1,metalness:0
    });
    let injected=0;
    material.onBeforeCompile=shader=>{
      injected++;
      Object.assign(shader.uniforms,uniforms);
      shader.vertexShader=shader.vertexShader
        .replace("#include <common>","#include <common>\n"+vertexDecl)
        .replace("#include <project_vertex>",
          "#include <project_vertex>\n"+vertexPosition);
      shader.fragmentShader=shader.fragmentShader
        .replace("#include <common>","#include <common>\n"+fragment)
        .replace("#include <opaque_fragment>",
          outgoing+"\n"+earthshine+"\n#include <opaque_fragment>");
    };
    const moon=new THREE.Mesh(new THREE.SphereGeometry(1737.4,96,64),material);
    scene.add(moon);
    const gl=renderer.getContext();
    const cases=[
      {name:"pbr_clear",active:0,earthY:0},
      {name:"pbr_total",active:1,earthY:0},
      {name:"pbr_partial",active:1,earthY:-6200},
      {name:"pbr_dark_l0",active:1,earthY:0,danjon:-1},
      {name:"pbr_copper_l4",active:1,earthY:0,danjon:3},
      {name:"pbr_unlit_no_earthshine",active:0,earthY:0,sunBehind:true,earthshine:0},
      {name:"pbr_unlit_earthshine_test_boost",active:0,earthY:0,sunBehind:true,earthshine:0.25},
    ];
    const images=[];
    for(const entry of cases){
      uniforms.uEclipseActive.value=entry.active;
      uniforms.uEclipseDanjonOffset.value=entry.danjon||0;
      uniforms.uEarthshineIrradianceRatio.value=entry.earthshine||0;
      sun.position.set(entry.sunBehind?10000:-10000,0,0);
      uniforms.uEclipseEarthWorld.value.set(-384400,entry.earthY,0);
      renderer.render(scene,camera);
      gl.finish();
      if(gl.getError()!==gl.NO_ERROR)throw Error("Three.js lunar GPU error");
      const data=new Uint8Array(256*256*4);
      gl.readPixels(0,0,256,256,gl.RGBA,gl.UNSIGNED_BYTE,data);
      const center=(128*256+128)*4;
      const centerBrightness=(data[center]+data[center+1]+data[center+2])/765;
      const sample=[];
      // The central disk avoids background, specular clipping and limb falloff.
      for(let y=90;y<=166;y+=4)
        for(let x=90;x<=166;x+=4){
          const i=(y*256+x)*4;
          sample.push((data[i]+data[i+1]+data[i+2])/765);
        }
      images.push({
        name:entry.name,centerBrightness,
        midDiskMin:Math.min(...sample),
        midDiskMax:Math.max(...sample),
        meanMidDisk:sample.reduce((a,b)=>a+b,0)/sample.length,
        image:canvas.toDataURL("image/png")
      });
    }
    return {injected,images,version:gl.getParameter(gl.VERSION)};
  },{vertexDecl,vertexPosition,fragment,outgoing,earthshine});
  assert.ok(output.injected>=1,"PBR shader onBeforeCompile was not invoked");
  assert.equal(errors.length,0,"PBR GPU emitted shader errors: "+errors.join("; "));
  const metrics=[];
  for(const item of output.images){
    writeFileSync(outDir+"/"+item.name+".png",
      Buffer.from(item.image.split(",")[1],"base64"));
    metrics.push({name:item.name,centerBrightness:item.centerBrightness,
      meanMidDisk:item.meanMidDisk,midDiskMin:item.midDiskMin,
      midDiskMax:item.midDiskMax});
  }
  const [clear,total,partial]=metrics;
  assert.ok(clear.centerBrightness>0.15,
    "PBR moon must render physically lit surface in no-eclipse geometry");
  assert.ok(total.centerBrightness<clear.centerBrightness*0.55,
    "Central totality must substantially darken PBR Moon surface");
  assert.ok(partial.meanMidDisk>total.meanMidDisk*1.12,
    "Lunar partial eclipse should reveal brighter PBR surface than totality");
  assert.ok(partial.meanMidDisk<clear.meanMidDisk*0.96,
    "Partial eclipse must retain physical shadow, not become fully illuminated");
  assert.ok(partial.midDiskMax-partial.midDiskMin > total.midDiskMax-total.midDiskMin+0.03,
    "Spatial shadow gradient must survive the entire Three.js PBR pipeline");
  const dark=metrics.find(x=>x.name==="pbr_dark_l0");
  const copper=metrics.find(x=>x.name==="pbr_copper_l4");
  assert.ok(dark.centerBrightness<total.centerBrightness &&
    total.centerBrightness<copper.centerBrightness,
    "Danjon L0/L1/L4 PBR must preserve monotonic eclipse brightness");
  const unlit=metrics.find(x=>x.name==="pbr_unlit_no_earthshine");
  const earthlit=metrics.find(x=>x.name==="pbr_unlit_earthshine_test_boost");
  assert.ok(earthlit.centerBrightness>unlit.centerBrightness+0.025,
    "Moon-only Earthshine must illuminate the unlit lunar hemisphere");
  assert.ok(earthlit.centerBrightness<clear.centerBrightness,
    "Even exaggerated QA-only Earthshine must not overpower direct sunlight");
  const report={status:"PASS",scope:"Real Three.js MeshStandardMaterial PBR with actual CUPOLA injection",
    accuracy:"Synthetic albedo; no claimed NASA texture or atmospheric color certification",
    shaderCompileInvocations:output.injected,gl:output.version,metrics};
  writeFileSync(outDir+"/pbr-report.json",JSON.stringify(report,null,2));
  console.log("CUPOLA PBR GPU ECLIPSE PASS",JSON.stringify(report));
}finally{
  await browser.close();
}
