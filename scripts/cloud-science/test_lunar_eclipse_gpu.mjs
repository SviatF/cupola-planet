#!/usr/bin/env node
/**
 * CUPOLA 4.1: actual WebGL/SwiftShader pixel test of the production fragment
 * snippets inserted into the PBR Moon material. These are 2D shadow-field
 * diagnostics; passing does not certify photorealistic lunar PBR appearance.
 */
import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {chromium}=require("/tmp/cupola-eclipse-gpu/node_modules/playwright");
const source=readFileSync("lib/earth/moonEclipseShader.ts","utf8");
function snippet(name){
  const m=source.match(new RegExp("export const "+name+"=[\\s\\S]*?`([\\s\\S]*?)`;"));
  assert.ok(m,"Missing production lunar shader snippet: "+name);
  return m[1];
}
const fragment=snippet("MOON_ECLIPSE_FRAGMENT");
const outgoing=snippet("MOON_ECLIPSE_OUTGOING_LIGHT");
assert.match(fragment,/vMoonEclipseWorld-uEclipseApparentOffset/);
assert.match(outgoing,/outgoingLight \*= lunarEclipseRadiance;/);
const width=256,height=160;
const behind=[-149600000,0,0],ahead=[149600000,0,0];
const cases=[
  {name:"total",moon:[384400,0,0],sun:behind,active:1,offset:[0,0,0]},
  {name:"penumbral_contact",moon:[384400,5000,0],sun:behind,active:1,offset:[0,0,0]},
  {name:"refracted_render_offset",moon:[384400,5000,0],sun:behind,active:1,offset:[0,8000,10000]},
  {name:"sun_in_front",moon:[384400,5000,0],sun:ahead,active:1,offset:[0,0,0]},
  {name:"broad_phase_disabled",moon:[384400,0,0],sun:behind,active:0,offset:[0,0,0]}
];
const outDir="eclipse-gpu-evidence";
mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true,args:[
  "--no-sandbox","--enable-webgl","--use-gl=angle","--use-angle=swiftshader"
]});
let gpu;
try{
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  const errors=[];
  page.on("pageerror",err=>errors.push(err.message));
  page.on("console",msg=>{if(msg.type()==="error")errors.push(msg.text());});
  await page.setContent('<body style="margin:0;background:#000"><canvas width="'+width+
    '" height="'+height+'"></canvas></body>');
  gpu=await page.evaluate(({fragment,outgoing,width,height,cases})=>{
    const canvas=document.querySelector("canvas");
    const gl=canvas.getContext("webgl",{
      preserveDrawingBuffer:true,antialias:false,alpha:false
    });
    if(!gl)throw Error("Chromium WebGL context unavailable");
    const vertex=[
      "precision highp float;",
      "attribute vec2 aPosition;",
      "varying vec3 vMoonEclipseWorld;",
      "uniform vec3 uMoonCenter;",
      "uniform vec3 uEclipseApparentOffset;",
      "void main(){",
      "vec2 uv=aPosition*0.5+0.5;",
      "vMoonEclipseWorld=uMoonCenter+uEclipseApparentOffset+",
      "  vec3(0.0,(uv.x-0.5)*7000.0,(uv.y-0.5)*6000.0);",
      "gl_Position=vec4(aPosition,0.0,1.0);",
      "}"
    ].join("\n");
    const pixel=[
      "precision highp float;",fragment,
      "void main(){",
      "vec3 outgoingLight=vec3(1.0);",outgoing,
      "gl_FragColor=vec4(outgoingLight,1.0);","}"
    ].join("\n");
    function compile(type,text){
      const sh=gl.createShader(type);gl.shaderSource(sh,text);gl.compileShader(sh);
      if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))
        throw Error("Moon GLSL compile failed: "+gl.getShaderInfoLog(sh));
      return sh;
    }
    const program=gl.createProgram();
    gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));
    gl.attachShader(program,compile(gl.FRAGMENT_SHADER,pixel));
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))
      throw Error("Moon GLSL link failed: "+gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([
      -1,-1,1,-1,-1,1,-1,1,1,-1,1,1
    ]),gl.STATIC_DRAW);
    const attribute=gl.getAttribLocation(program,"aPosition");
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
    const loc={};
    for(const name of ["uMoonCenter","uEclipseApparentOffset","uEclipseEarthWorld",
      "uEclipseActive","uEclipseSunDirection","uEclipseEarthRadius",
      "uEclipseSolarAngularRadius"]){
      loc[name]=gl.getUniformLocation(program,name);
      if(loc[name]===null)throw Error("Moon GLSL uniform missing: "+name);
    }
    gl.viewport(0,0,width,height);
    gl.disable(gl.BLEND);gl.disable(gl.DITHER);gl.disable(gl.DEPTH_TEST);
    gl.pixelStorei(gl.PACK_ALIGNMENT,1);
    const results=[];
    for(const test of cases){
      const delta=test.sun.map((v,i)=>v-test.moon[i]);
      const dist=Math.hypot(...delta);
      gl.uniform3fv(loc.uMoonCenter,test.moon);
      gl.uniform3fv(loc.uEclipseApparentOffset,test.offset);
      gl.uniform3fv(loc.uEclipseEarthWorld,[0,0,0]);
      gl.uniform1f(loc.uEclipseActive,test.active);
      gl.uniform3fv(loc.uEclipseSunDirection,delta.map(v=>v/dist));
      gl.uniform1f(loc.uEclipseEarthRadius,6371);
      gl.uniform1f(loc.uEclipseSolarAngularRadius,Math.asin(695700/dist));
      gl.drawArrays(gl.TRIANGLES,0,6);gl.finish();
      const problem=gl.getError();
      if(problem!==gl.NO_ERROR)throw Error("Moon GPU error "+problem);
      const pixels=new Uint8Array(width*height*4);
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      results.push({name:test.name,pixels:Array.from(pixels),
        screenshot:canvas.toDataURL("image/png")});
    }
    function drawBatch(active,repeats){
      gl.uniform3fv(loc.uMoonCenter,[384400,0,0]);
      gl.uniform3fv(loc.uEclipseApparentOffset,[0,0,0]);
      gl.uniform3fv(loc.uEclipseEarthWorld,[0,0,0]);
      gl.uniform3fv(loc.uEclipseSunDirection,[-1,0,0]);
      gl.uniform1f(loc.uEclipseSolarAngularRadius,Math.asin(695700/150000000));
      gl.uniform1f(loc.uEclipseActive,active);
      const t=performance.now();
      for(let i=0;i<repeats;i++)gl.drawArrays(gl.TRIANGLES,0,6);
      gl.finish();
      return Number((performance.now()-t).toFixed(2));
    }
    return {renderer:gl.getParameter(gl.RENDERER),
      glVersion:gl.getParameter(gl.VERSION),results,
      perf:{noEclipse24DrawsMs:drawBatch(0,24),
        eclipse24DrawsMs:drawBatch(1,24)}};
  },{fragment,outgoing,width,height,cases});
  assert.equal(errors.length,0,
    "Browser logged WebGL errors: "+errors.join("; "));
}finally{
  await browser.close();
}
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const norm=a=>Math.hypot(...a);
function cpuSolarBlocked(point,moon,sun,active){
  if(!active)return 0;
  const e=sub([0,0,0],point),r=norm(e);
  const s=sub(sun,moon),d=norm(s);
  const re=Math.asin(6371/r),rs=Math.asin(695700/d);
  const sep=Math.acos(clamp(dot(e,s)/(r*d),-1,1));
  if(sep>=re+rs)return 0;
  if(sep<=Math.abs(re-rs))return clamp(re*re/(rs*rs),0,1);
  const e2=re*re,s2=rs*rs,d2=sep*sep;
  const ae=Math.acos(clamp((d2+e2-s2)/(2*sep*re),-1,1));
  const as=Math.acos(clamp((d2+s2-e2)/(2*sep*rs),-1,1));
  const det=Math.sqrt(Math.max(0,
    (-sep+re+rs)*(sep+re-rs)*(sep-re+rs)*(sep+re+rs)));
  return clamp((e2*ae+s2*as-0.5*det)/(Math.PI*s2),0,1);
}
const report={status:"PASS",source:"production Moon GLSL snippet",
  scope:"Shader shadow field, not calibrated Moon PBR appearance",
  comparison:"independent analytic JS disc-overlap",
  renderer:gpu.renderer,glVersion:gpu.glVersion,
  pixelTolerance8bit:0.04,
  perf:{status:"DIAGNOSTIC_ONLY_SOFTWARE_GL_NOT_REAL_GPU_FPS",
    noEclipse24DrawsMs:gpu.perf.noEclipse24DrawsMs||null,
    eclipse24DrawsMs:gpu.perf.eclipse24DrawsMs||null},cases:[]};
let maxErr=0,checked=0;
const saved=new Map();
for(const [i,test] of cases.entries()){
  const result=gpu.results[i];
  assert.equal(result.name,test.name);
  writeFileSync(outDir+"/"+test.name+".png",
    Buffer.from(result.screenshot.split(",")[1],"base64"));
  const data=result.pixels, reds=[];
  for(let y=8;y<height;y+=12){
    for(let x=8;x<width;x+=12){
      const k=(y*width+x)*4;
      const rgb=[data[k]/255,data[k+1]/255,data[k+2]/255];
      const point=[test.moon[0],test.moon[1]+((x+0.5)/width-0.5)*7000,
        test.moon[2]+((y+0.5)/height-0.5)*6000];
      const f=cpuSolarBlocked(point,test.moon,test.sun,test.active);
      const expected=[1-0.955*f,1-0.991*f,1-0.996*f];
      const err=Math.max(...rgb.map((v,j)=>Math.abs(v-expected[j])));
      maxErr=Math.max(maxErr,err);checked++;reds.push(rgb[0]);
      if(err>0.04)throw Error("GPU vs CPU lunar pixel mismatch "+
        JSON.stringify({test:test.name,x,y,rgb,expected,error:err}));
    }
  }
  const min=Math.min(...reds),max=Math.max(...reds);
  if(test.name==="total")
    assert.ok(min<0.16,"Total lunar eclipse has to be dark");
  if(test.name==="penumbral_contact"){
    assert.ok(min<0.16&&max>0.9,"Need shadow AND bright limb in one image");
    assert.ok(reds.some(x=>x>0.25&&x<0.85),"Need continuous penumbra");
  }
  if(test.name==="sun_in_front"||test.name==="broad_phase_disabled")
    assert.ok(min>0.98,"No eclipse must preserve full brightness");
  saved.set(test.name,data);
  report.cases.push({scenario:test.name,redMin:Number(min.toFixed(4)),
    redMax:Number(max.toFixed(4)),samples:reds.length});
}
const a=saved.get("penumbral_contact"),b=saved.get("refracted_render_offset");
let offsetDelta=0;
for(let i=0;i<a.length;i++)offsetDelta=Math.max(offsetDelta,Math.abs(a[i]-b[i]));
assert.ok(offsetDelta<=3,"Camera refraction must not shift physical eclipse shadow");
report.apparentOffsetMaxChannelByteDifference=offsetDelta;
report.maxGpuCpuChannelDifference=Number(maxErr.toFixed(5));
report.totalReferenceSamples=checked;
writeFileSync(outDir+"/report.json",JSON.stringify(report,null,2));
console.log("CUPOLA 4.1 GPU ECLIPSE PASS",JSON.stringify(report,null,2));
