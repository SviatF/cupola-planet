#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildFactLedger,validateLedger,utcWindow,previousUtcDay} from "../../lib/editorial/dailyFacts.mjs";
import {validateNarrative,draftWithDeepSeek} from "../../lib/editorial/deepseekNarrative.mjs";

const now=Date.parse("2026-10-24T01:10:00.000Z"),day="2026-10-23";
const quake=(id,magnitude,hour)=>({
  id,latitude:49,longitude:24,depth:10,magnitude,place:"Test region",
  time:Date.parse("2026-10-23T"+hour+":30:00.000Z"),
  url:"https://earthquake.usgs.gov/earthquakes/eventpage/"+id
});
const input={
  earthquakes:{
    dataStatus:"SOURCE_VERIFIED_RECENT",
    provenance:"USGS_GEOJSON_VERIFIED",
    sourceGeneratedAt:new Date(now-5*60_000).toISOString(),
    earthquakes:[quake("mock-a",5.1,"19"),quake("mock-b",4.6,"18"),
      quake("mock-c",4.2,"14"),quake("mock-d",3.9,"10"),
      quake("future",9,"23")],
  },
  storms:{
    dataStatus:"official-advisories",updatedAt:new Date(now-5*60_000).toISOString(),
    storms:[{id:"mock-storm",name:"Demo storm",latitude:15,longitude:-70,
      advisoryTime:"2026-10-23T22:00:00.000Z"}],
  },
  wildfires:{mode:"offline",dataStatus:"offline",hotspots:[]},
  aurora:{dataStatus:"offline",points:[]}
};
const ledger=buildFactLedger(day,input,now);
assert.equal(previousUtcDay(new Date("2026-10-24T01:00:00Z")),day);
assert.equal(utcWindow(day).end,Date.parse("2026-10-24T00:00:00Z"));
assert.equal(ledger.facts.length,6);
assert.equal(ledger.quality.independentSources,2);
assert.equal(ledger.quality.eligibleForEditorialReview,true);
assert.equal(ledger.quality.indexApproved,false);
assert.equal(ledger.sources.length,2);
assert.ok(ledger.facts.every(f=>f.occurredAt.startsWith(day)));
assert.ok(ledger.facts.every(f=>f.sourceUrl.startsWith("https://")));
assert.ok(ledger.unavailableSources.includes("wildfires"));
assert.ok(validateLedger(ledger));
const copy=structuredClone(ledger);
copy.facts[0].measurements.magnitude=9.9;
assert.throws(()=>validateLedger(copy),/Facts changed/);
assert.throws(()=>buildFactLedger("2026-10-24",input,now),/Complete UTC day/);
assert.throws(()=>utcWindow("2026-02-30"),/Invalid calendar/);
const bad=structuredClone(input);
bad.storms.updatedAt="2026-10-18T10:00:00.000Z";
const degraded=buildFactLedger(day,bad,now);
assert.equal(degraded.facts.filter(f=>f.source==="storms").length,0,
  "stale advisories must never enter day report");
assert.equal(degraded.quality.eligibleForEditorialReview,false);
const noKey=await draftWithDeepSeek(ledger,{apiKey:null});
assert.equal(noKey.narrative,null);
assert.equal(noKey.editorialStatus,"awaiting-ai-secret");
const valid={
  intro:"The selection of verified Earth observations reveals several unrelated events during the reporting period. These reports describe observations and advisories, rather than a complete inventory of activity across the planet. Each event should be interpreted in the context of its original instrument or reporting agency.",
  highlights:[
    {factId:ledger.facts[0].id,commentary:"The reported earthquake is one event in a limited source feed; its timing and magnitude should be read from the accompanying verified observation card."},
    {factId:ledger.facts[4].id,commentary:"This selected agency entry adds a different perspective, while its original timestamp and the geographic limits of the monitoring service remain important."}
  ]
};
assert.equal(validateNarrative(valid,ledger).highlights.length,2);
assert.throws(()=>validateNarrative({...valid,highlights:[{factId:"fake",commentary:valid.highlights[0].commentary},valid.highlights[1]]},ledger),/unverified/);
assert.throws(()=>validateNarrative({...valid,intro:"There were 27 billion earthquakes."},ledger),/numeric/);
assert.throws(()=>validateNarrative(valid,ledger,[{narrative:valid}]),/Near-duplicate/);
const published=JSON.parse(readFileSync("data/editorial/published.json","utf8"));
assert.equal(published.schemaVersion,1);
assert.ok(Array.isArray(published.reports));
const publishedDays=new Set();
for(const record of published.reports) {
  assert.equal(record.indexApproved,true,"unapproved report cannot appear in live registry");
  assert.equal(record.pageStatus,"PUBLISHED");
  assert.equal(record.day,record.ledger.day);
  assert.ok(!publishedDays.has(record.day),"same-day duplicate canonical");
  publishedDays.add(record.day);
  validateLedger(record.ledger);
  assert.ok(record.ledger.quality.eligibleForEditorialReview,
    "a report cannot publish before independent source diversity and fact volume pass");
  const signoff=record.approvedBy;
  assert.ok(signoff?.editor?.trim() && signoff?.scienceReviewer?.trim(),
    "two independent editorial and scientific sign-offs are mandatory");
  assert.ok(Number.isFinite(Date.parse(signoff.publishedAt)) &&
    Date.parse(signoff.publishedAt)>utcWindow(record.day).end);
  const hero=record.media?.hero;
  for(const key of ["url","captureManifestUrl"]) {
    const u=new URL(hero[key]);
    assert.equal(u.protocol,"https:");
    assert.ok(u.hostname==="cupola.earth" || u.hostname.endsWith(".cupola.earth"),
      "approved WebP and capture provenance must be hosted under a controlled CUPOLA domain");
  }
  assert.ok(hero.url.endsWith(".webp"),"CUPOLA-generated WebP required");
  assert.ok(hero.sceneRevision?.trim() && Number.isFinite(Date.parse(hero.renderedAt)),
    "verified scene revision/render timestamp required");
  assert.ok(typeof hero.alt==="string" && hero.alt.length>=35);
  validateNarrative(record.editorial.narrative,record.ledger,
    published.reports.filter(p=>p.day!==record.day).map(p=>p.editorial));
}
const sitemap=readFileSync("app/sitemap.ts","utf8");
assert.ok(sitemap.includes("approvedDailyReports.map"),"only approved records can feed sitemap");
const page=readFileSync("app/earth/daily/[date]/page.tsx","utf8");
assert.ok(page.includes("dynamicParams=false"),"unknown or draft date must 404");
assert.ok(page.includes("dailyReportByDay"),"never fetch unpublished draft in site runtime");
console.log("PASS daily-report: verified UTC facts, source freshness, hashed snapshot, AI fact refs, no secret fallback, near-duplicate guard, no publish");
