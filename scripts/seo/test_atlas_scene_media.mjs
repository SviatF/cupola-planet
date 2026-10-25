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
assert.ok(media.includes('src="/explore?embed=1&hero=sunrise"'),
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
assert.equal(presets.presets.length,6);
assert.equal(new Set(presets.presets.map(p=>p.id)).size,6,"capture ids must remain globally unique");
assert.ok(presets.presets.every(p=>p.route.startsWith("/explore?capture=1")&&
  p.width===1600&&p.height===900),"capture presets must use only the actual Earth scene");
const captureJob=text(".github/workflows/cupola-scene-capture.yml");
assert.ok(presets.presets.some(p=>p.assetId==="from-orbit-feature" && p.pageId==="earth"),
 "the From Orbit editorial visual must have its own explicitly dispatchable capture preset");
assert.ok(captureJob.includes('PAGE_ID\" = \"earth\"'),
 "from-orbit capture must be explicitly mapped in the GitHub workflow");
assert.ok(captureJob.includes("workflow_dispatch:"),"only an explicit authorized request may start a new media capture");
assert.ok(!/\bschedule:\s*\n/.test(captureJob),"scheduled automatic media generation must remain disabled");
assert.ok(captureJob.includes("CUPOLA_CAPTURE_PAGE") && captureJob.includes("CUPOLA_CAPTURE_TYPE"),
  "requested page and format must be bound to capture run");
const captureScript=text("scripts/scene-capture/render.mjs");
assert.ok(captureScript.includes("page/preset mismatch"),
  "capture job must never accept a camera preset for another page");
assert.ok(captureScript.includes('execFileSync("ffmpeg"') &&
  captureScript.includes('execFileSync("ffprobe"') &&
  captureScript.includes("durationSeconds"),
  "8-second original scene film must be trimmed and duration validated");
assert.ok(captureScript.includes("sceneRevision:validatedDeployedRevision") &&
  captureScript.includes("REMOTE_DEPLOYMENT_SHA_UNVERIFIED"),
  "remote Cloudflare scene commit must never be guessed from the requesting workflow");
assert.ok(captureScript.includes("cloudSourceEvidence:cloudEvidence"),
  "capture must contain cloud source state and applied GPU layer information");
assert.ok(captureScript.includes("recordVideo:") && captureScript.includes("clip.saveAs"),
  "explicit video requests must use captured original Three.js scene, not stock or generated fake video");
for(const p of presets.presets){
  assert.ok(["home","satellites","earth"].includes(p.pageId));
  assert.ok(p.renderTypes.includes("still")&&p.renderTypes.includes("video"));
  assert.ok(["explicit-request-only","scheduled-editorial-reviewed"].includes(p.capturePolicy),
    "every preset must be review-gated, never auto-published");
  assert.equal(p.requiresScienceApproval,true);
}

// CUPOLA 8.4: ONLY ORIGINAL CUPOLA SCENE MEDIA APPEARS IN THE GALLERY.
// NASA historic sources still power the explanations, without using their
// photographs as generic stock art or pretending we re-photographed Landsat.
const featured=text("components/editorial/FeaturedAtlas.tsx");
const learn=text("app/learn/page.tsx");
assert.ok(root.includes("<FeaturedAtlas/>") && root.includes("<FieldNotes/>"),
 "Atlas leads with original CUPOLA scenes and science-led editorial content");
for (const id of ["clouds-hero","day-night-hero","night-lights-hero"]) {
 assert.ok(featured.includes(id),"home gallery needs own unique renderer asset: "+id);
 assert.ok(presets.presets.some(p=>p.id===id&&p.pageId==="earth"),
   "each home-gallery visual needs an actual WebGL capture request");
}
assert.ok(featured.includes("getApprovedSceneAsset") &&
  !featured.includes("<img src={lead.image}") &&
  !featured.includes("<img src={item.image}"),
  "home cannot silently fall back to external NASA photography");
assert.ok(!learn.includes("<img src={item.image}"),
 "original NASA primary records must be linked, not rendered as our site's own artwork");
assert.ok(featured.includes("NASA Earth Observatory") && featured.includes("sourceUrl"),
 "retain original NASA references for science literacy");
assert.ok(featured.includes("NOT SATELLITE PHOTOGRAPHY") &&
 featured.includes("mixed-age observations"),"scene disclosure must be readable");
for(const href of ["/earth/clouds","/earth/day-and-night","/earth/night-lights","/earth",
 "/satellites","/methodology"]){
 assert.ok(featured.includes(href)||root.includes(href),
 "all gallery links need the existing verified CUPOLA routes: "+href);
}
const editor=text("app/editorial-refinement.css");
assert.ok(editor.includes(".ae28-stories-grid") && editor.includes(".ae28-story-row"),
 "original scenes need cohesive responsive editorial placement");
const factory=text(".github/workflows/cupola-original-media-factory.yml");
assert.ok(factory.includes("schedule:") && factory.includes("workflow_dispatch:"),
 "genuine automated capture must run recurrently and support explicit regeneration");
assert.ok(factory.includes("scripts/scene-capture/stage-editorial.mjs") &&
 factory.includes("create-pull-request@v7"),"generated binary media must flow to a gated review PR");
assert.ok(factory.includes("media/scene-render-review") &&
 !factory.includes("cf:deploy"),"source-unverified captures cannot directly deploy");
const stage=text("scripts/scene-capture/stage-editorial.mjs");
for(const clause of ["sceneRevision:evidence.sceneRevision??null",
 "PENDING_SCIENTIFIC_AND_EDITORIAL_REVIEW","sha256","sceneReadyVerified"]){
 assert.ok(stage.includes(clause),"stage must preserve exact original WebGL evidence "+clause);
}

const nextConfig=text("next.config.ts");
assert.ok(nextConfig.includes("X-Cupola-Revision") &&
 nextConfig.includes('execFileSync("git"'),
 "Cloudflare WebGL must attest its own built source SHA instead of inventing request revision");
const promote=text("scripts/scene-capture/promote-reviewed.mjs");
for(const clause of ["REMOTE_REVISION_HEADER_VERIFIED","sceneReadyVerified",
 "CUPOLA_3D_RENDER_NOT_A_SATELLITE_PHOTOGRAPH",
 "PENDING_SCIENTIFIC_AND_EDITORIAL_REVIEW","scene-assets.json",
 "scene-captures/published","sha256"]){
 assert.ok(promote.includes(clause),"publication must preserve independent evidence "+clause);
}
const publishJob=text(".github/workflows/cupola-original-media-publish.yml");
assert.ok(publishJob.includes("workflow_dispatch:") &&
 publishJob.includes("scientific_review_notes") &&
 publishJob.includes("promote-reviewed.mjs"),"publishing needs an explicit science signoff");
assert.ok(!publishJob.includes("cf:deploy"),"publication must travel through reviewed main merge");
console.log("PASS CUPOLA 8.4: no stock photos, original WebGL capture factory, provenance and publication gates");

