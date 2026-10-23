#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const text=(f)=>readFileSync(f,"utf8");
const assets=JSON.parse(text("data/editorial/scene-assets.json"));
const presets=JSON.parse(text("config/scene-capture-presets.json"));
assert.equal(assets.schemaVersion,1);
assert.equal(presets.schemaVersion,1);
const scene=text("components/CupolaExperience.tsx");
assert.ok(scene.includes('embedded-scene') && scene.includes('capture-scene'),
  "all content imagery must be derived from the existing actual CUPOLA WebGL scene");
const root=text("app/page.tsx");
assert.ok(root.includes("LiveHeroScene") && root.includes('href="/explore"'),
  "editorial root must contain live source scene, linking to full WebGL viewport");
assert.ok(existsSync("app/explore/page.tsx"));
const media=text("components/editorial/SceneFrame.tsx");
assert.ok(media.includes('a.approved===true') && media.includes('CUPOLA_CAPTURE_ENGINE'),
  "no unapproved or stock images may be rendered as CUPOLA observations");
assert.ok(media.includes('src="/explore?embed=1"'),
  "CUPOLA hero must use the actual viewer, not a separate fake globe");
assert.ok(assets.assets.every(a=>a.approved===true&&a.origin==="CUPOLA_CAPTURE_ENGINE"));
for(const page of ["app/earth/cities/page.tsx","app/earth/daily/page.tsx"]){
  const html=text(page);
  assert.ok(html.includes("index:false")||html.includes("index:approvedDailyReports.length>0"),
    "candidate-only pages must not claim indexing while no source-backed media exists");
}
const profile=text("app/satellites/[slug]/page.tsx");
assert.ok(profile.includes("/explore?satellite="),
  "satellite pages must deep-link into the new actual Earth scene route");
const urls=["/","/explore","/earth","/earth/clouds","/earth/day-and-night",
  "/earth/night-lights","/events","/learn","/methodology","/data-sources","/satellites"];
const paths=new Set(urls);
assert.equal(paths.size,urls.length);
for(const url of urls){
 const p=url==="/"? "app/page.tsx":"app"+url+"/page.tsx";
 assert.ok(existsSync(p),"reviewed page is missing: "+url);
}
assert.equal(presets.presets.length,2);
assert.ok(presets.presets.every(p=>p.route.startsWith("/explore?capture=1")&&
  p.width===1600&&p.height===900),"capture presets must use only the actual Earth scene");
console.log("PASS: original scene-only media gate, 3D route, cinematic page map and approved image policy");
