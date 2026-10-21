#!/usr/bin/env node
/**
 * CUPOLA 4.5: Offline SHA-bound lunar atlas QA.
 * This uses the REAL local NASA LROC map, IAU rotation and Three.js WebGL.
 * Independent of Cloudflare availability, ambient light, Sun phase, weather.
 * View north up in a geocentric synthetic frame, NOT a site-specific sky photo.
 */
import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {createRequire} from "node:module";
const requireTmp=createRequire("/tmp/cupola-eclipse-gpu/package.json");
const {chromium}=requireTmp("playwright");
const esbuild=requireTmp("esbuild");

function loadTs(path){
  const compiled=esbuild.transformSync(readFileSync(path,"utf8"),{
    loader:"ts",format:"cjs",target:"es2022"
  }).code;
  const module={exports:{}};
  new Function("require","module","exports",compiled)(requireTmp,module,module.exports);
  return module.exports;
}
const iau=loadTs("lib/earth/lunarIauOrientation.ts");
const celestial=loadTs("lib/earth/celestialEngine.ts");
const dates=[
  "2026-09-01T00:00:00Z",
  "2026-09-09T00:00:00Z",
  "2026-09-17T00:00:00Z",
  "2026-09-25T00:00:00Z",
];
const frames=dates.map(iso=>{
  const moon=celestial.celestialAt(new Date(iso)).moon.earthFixedKm;
  return {iso,moon,frame:iau.moonIauBodyFrameAt(new Date(iso),moon)};
});
const moonImage=readFileSync("public/moon/lroc_color_4k.webp");
assert.ok(moonImage.length>1_000_000,"NASA LROC map must be real, not placeholder");
const texture="data:image/webp;base64,"+moonImage.toString("base64");
const bundle=await esbuild.build({
 stdin:{contents:'import * as THREE from "three";window.CUPOLA_LUNAR_THREE=THREE;',
  resolveDir:"/tmp/cupola-eclipse-gpu",sourcefile:"lunar-qa-entry.js"},
 bundle:true,write:false,platform:"browser",format:"iife",logLevel:"silent"
});
const browser=await chromium.launch({headless:true,args:[
  "--no-sandbox","--enable-webgl","--use-gl=angle","--use-angle=swiftshader"
]});
const dir="lunar-libration-evidence";mkdirSync(dir,{recursive:true});
const report={status:"PASS",source:"NASA LROC color 4K, IAU RotationAxis",
  view:"Geocentric Earth-to-Moon, Earth geographic north projected up, artificial full-albedo illumination for crater inspection",
  note:"Not local telescope view; no UTC override of LIVE scene",
  frames:[]};
try{
  const page=await browser.newPage({viewport:{width:700,height:775},deviceScaleFactor:1});
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error"||/THREE.WebGLProgram|Shader Error|ERROR: 0:/.test(m.text()))errors.push(m.text());});
  await page.setContent('<html><head><style>body{margin:0;background:#090d15;color:#eee;font:13px system-ui,sans-serif;display:grid;justify-content:center;}#meta{height:74px;padding-top:18px;box-sizing:border-box}h2{font-size:16px;font-weight:550;margin:0 0 5px}small{color:#b2a78c}#stage{position:relative;background:#080b12}canvas{width:620px;height:620px;display:block}.crater{position:absolute;font:11px system-ui,sans-serif;white-space:nowrap;color:#ffe7ae;text-shadow:0 1px 4px #000;pointer-events:none}.crater:before{content:"";position:absolute;left:-7px;top:4px;width:4px;height:4px;background:#f4ce83;border:1px solid #0b1117;border-radius:10px}</style></head><body><div id="meta"></div><div id="stage"><canvas id="moon" width="620" height="620"></canvas></div><p style="max-width:610px;color:#808a97;font-size:11px">CUPOLA · IAU orientation QA · NASA LROC 4K · simulated geocentric north-up comparison · NO LIVE UTC CHANGE</p></body></html>');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(async texture=>{
    const THREE=window.CUPOLA_LUNAR_THREE;
    const canvas=document.querySelector("#moon");
    const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
    renderer.setPixelRatio(1);renderer.setSize(620,620,false);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.NoToneMapping;
    const scene=new THREE.Scene();
    scene.background=new THREE.Color("#080b12");
    const camera=new THREE.PerspectiveCamera(31,1,0.1,30);
    camera.position.set(0,0,4.7);camera.up.set(0,1,0);camera.lookAt(0,0,0);
    const map=await new Promise((resolve,reject)=>new THREE.TextureLoader().load(texture,resolve,undefined,reject));
    map.colorSpace=THREE.SRGBColorSpace;
    map.anisotropy=4;
    const group=new THREE.Group();
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,192,128),
      new THREE.MeshBasicMaterial({map,toneMapped:false}));
    // Exactly same fixed mesh UV correction as production MoonVisual.
    mesh.rotation.y=-Math.PI/2;
    group.add(mesh);scene.add(group);
    const vec=v=>new THREE.Vector3(v.x,v.y,v.z);
    const dot=(a,b)=>a.dot(b);
    const project=(v,m,up)=>{
      const surface=new THREE.Vector3(
        Math.cos(v.lat*Math.PI/180)*Math.sin(v.lon*Math.PI/180),
        Math.sin(v.lat*Math.PI/180),
        Math.cos(v.lat*Math.PI/180)*Math.cos(v.lon*Math.PI/180)
      );
      const world=group.localToWorld(surface.clone());
      const look=world.clone().project(camera);
      return {x:(look.x+1)*310,y:(1-look.y)*310,visible:look.z<1 && world.z>0};
    };
    // Official selenographic IAU east-positive coordinates (Tycho from NASA).
    const craters=[
      {name:"TYCHO",lat:-43.37,lon:-11.32},
      {name:"COPERNICUS",lat:9.62,lon:-20.08},
      {name:"MARE CRISIUM",lat:17,lon:59}
    ];
    window.renderLibrationFrame=({iso,moon,frame})=>{
      const toEarth=vec(moon).multiplyScalar(-1).normalize();
      const up=new THREE.Vector3(0,1,0);
      up.addScaledVector(toEarth,-dot(up,toEarth)).normalize();
      const right=new THREE.Vector3().crossVectors(up,toEarth).normalize();
      const mapped=v=>new THREE.Vector3(
        dot(vec(v),right),dot(vec(v),up),dot(vec(v),toEarth));
      const matrix=new THREE.Matrix4().makeBasis(
        mapped(frame.east),mapped(frame.north),mapped(frame.primeMeridian));
      group.quaternion.setFromRotationMatrix(matrix);
      group.updateMatrixWorld(true);
      renderer.render(scene,camera);
      if(renderer.getContext().getError()!==renderer.getContext().NO_ERROR)throw Error("LROC Moon render GPU error");
      const stage=document.querySelector("#stage");
      stage.querySelectorAll(".crater").forEach(el=>el.remove());
      const projected=[];
      for(const crater of craters){
        const p=project(crater);
        projected.push({name:crater.name,x:p.x,y:p.y,visible:p.visible});
        if(!p.visible)continue;
        const label=document.createElement("div");
        label.className="crater";
        label.style.left=p.x+"px";label.style.top=p.y+"px";
        label.textContent=crater.name;
        stage.appendChild(label);
      }
      document.querySelector("#meta").innerHTML=
        "<h2>IAU LUNAR LIBRATION — "+iso.slice(0,10)+" UTC</h2>"+
        "<small>SUB-EARTH LONG "+frame.subEarthLongitudeDeg.toFixed(3)+"° · LAT "+
        frame.subEarthLatitudeDeg.toFixed(3)+"° · NASA LROC ALBEDO (NO SHADOWS)</small>";
      return {projected,mapLoaded:!!map.image,canvasSize:[canvas.width,canvas.height],
        sample:renderer.domElement.toDataURL("image/png").slice(0,150)};
    };
  },texture);
  let first=null;
  for(let i=0;i<frames.length;i++){
    const f=frames[i];
    const d=await page.evaluate(frame=>window.renderLibrationFrame(frame),f);
    assert.equal(d.mapLoaded,true);
    assert.equal(d.projected.length,3);
    const output=dir+"/lroc-iau-"+f.iso.slice(0,10)+".png";
    await page.screenshot({path:output,animations:"disabled"});
    // Verify actual crater pixels change while camera stays fixed.
    const pixelKey=await page.locator("#moon").evaluate(canvas=>canvas.toDataURL("image/png").slice(-200));
    if(first!==null)assert.notEqual(pixelKey,first,"Moon textured view must change with libration");
    else first=pixelKey;
    report.frames.push({date:f.iso,subEarthLongitude:f.frame.subEarthLongitudeDeg,
      subEarthLatitude:f.frame.subEarthLatitudeDeg,craters:d.projected,
      screenshot:output});
  }
  assert.deepEqual(errors,[],"GPU/browser errors");
  writeFileSync(dir+"/report.json",JSON.stringify(report,null,2));
  console.log("CUPOLA NASA LROC IAU VISUAL QA PASS "+JSON.stringify(report));
}finally{await browser.close();}
