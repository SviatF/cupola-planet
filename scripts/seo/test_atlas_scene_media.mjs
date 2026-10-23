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

const ids=new Set();
for (const media of assets.assets) {
  assert.ok(!ids.has(media.id),"duplicate media ID: "+media.id); ids.add(media.id);
  assert.match(media.id,/^[a-z][a-z0-9-]*$/);
  assert.equal(media.approved,true);
  assert.equal(media.origin,"CUPOLA_CAPTURE_ENGINE");
  assert.ok(typeof media.alt==="string" && media.alt.length>=35);
  assert.ok(/^[a-f0-9]{40}$/.test(media.sceneRevision)||/^[a-f0-9]{64}$/.test(media.sceneRevision),
    "all published images need a reproducible source-commit SHA");
  const hero=new URL(media.url,"https://cupola.earth");
  const provenance=new URL(media.manifestUrl,"https://cupola.earth");
  for(const parsed of [hero,provenance]){
    assert.equal(parsed.protocol,"https:");
    assert.ok(parsed.hostname==="cupola.earth"||
      parsed.hostname==="media.cupola.earth","CUPOLA-owned host required");
  }
  assert.ok(hero.pathname.endsWith(".webp"),"page image must be real CUPOLA WebP");
  assert.ok(Number.isFinite(Date.parse(media.renderedAt)),
    "renderedAt cannot be blank or fabricated");
  if (media.sourceObservedAt!==null){
    assert.ok(Number.isFinite(Date.parse(media.sourceObservedAt)),"sourceObservedAt invalid");
    assert.ok(Date.parse(media.sourceObservedAt)<=Date.parse(media.renderedAt),
      "observed satellite product cannot postdate generated image");
  }
}

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
