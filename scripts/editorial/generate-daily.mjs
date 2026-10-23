#!/usr/bin/env node
/**
 * Scheduled editorial DRAFT pipeline, not a web request handler.
 * Reads the existing CUPOLA verified feeds, locks the date's source facts,
 * optionally asks DeepSeek to make a narrative, and writes a NON-PUBLISHED JSON.
 * This must never modify the public sitemap or deploy a daily page by itself.
 */
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { buildFactLedger, previousUtcDay, utcWindow, validateLedger } from "../../lib/editorial/dailyFacts.mjs";
import { draftWithDeepSeek } from "../../lib/editorial/deepseekNarrative.mjs";

const BASE="https://cupola.earth";
const OUT=resolve("data/editorial/drafts");
const FEEDS=[
  ["earthquakes","/api/earthquakes"],
  ["storms","/api/storms"],
  ["wildfires","/api/wildfires"],
  ["aurora","/api/aurora-oval"]
];
const args=process.argv.slice(2);
const dateIndex=args.indexOf("--day");
const inputIndex=args.indexOf("--fixture");
const dryRun=args.includes("--dry-run");
const date=dateIndex>=0?args[dateIndex+1]:previousUtcDay();
const window=utcWindow(date);
const nowMs=Date.now();
if(nowMs<window.end+20*60000)throw Error("Cannot publish a report for a day that has not fully finished");
if(nowMs>window.end+36*3600000 && inputIndex<0)
  throw Error("Source APIs are rolling; old-day backfills need archived verified snapshots");
async function jsonFetch(url) {
  const controller=new AbortController();
  const stop=setTimeout(()=>controller.abort(),16000);
  try{
    const response=await fetch(url,{
      headers:{"Accept":"application/json","User-Agent":"CUPOLA-DailyEditorial/1.0"},
      signal:controller.signal,cache:"no-store"});
    if(!response.ok)throw Error("HTTP "+response.status);
    const len=Number(response.headers.get("content-length")??0);
    if(len>2_000_000)throw Error("Feed exceeds bounded size");
    const value=await response.text();
    if(value.length>2_000_000)throw Error("Feed exceeds bounded size");
    return JSON.parse(value);
  }finally{clearTimeout(stop)}
}
let snapshots={};
if(inputIndex>=0) {
  const filename=args[inputIndex+1];
  if(!filename)throw Error("Missing fixture path");
  snapshots=JSON.parse(await readFile(resolve(filename),"utf8"));
} else {
  const results=await Promise.allSettled(FEEDS.map(async ([id,path])=>[
    id,await jsonFetch(BASE+path)]));
  for(let i=0;i<results.length;i++){
    const r=results[i];
    if(r.status==="fulfilled")snapshots[r.value[0]]=r.value[1];
    else console.warn("SOURCE_UNAVAILABLE",FEEDS[i][0],String(r.reason).slice(0,110));
  }
}
const ledger=buildFactLedger(date,snapshots,nowMs);
validateLedger(ledger);
if (!dryRun) {
  try {
    const previousSameDay=JSON.parse(await readFile(join(OUT,date+".json"),"utf8"));
    if (previousSameDay.ledger?.digest === ledger.digest) {
      console.log("IMMUTABLE_DRAFT_ALREADY_EXISTS",date,"same validated ledger, no rewrite");
      process.exit(0);
    }
    throw Error("Immutable date ledger changed: reviewer must investigate; automatic overwrite refused");
  } catch (e) {
    if (e?.code!=="ENOENT") throw e;
  }
}
console.log("FACTS",ledger.facts.length,"INDEPENDENT_SOURCES",ledger.quality.independentSources,
  "REVIEW_ELIGIBLE",ledger.quality.eligibleForEditorialReview);
if(!ledger.quality.enoughForDraft){
  console.warn("NO_DRAFT: Source diversity or fact verification is insufficient.");
  process.exit(0);
}
let previous=[];
try {
  const files=(await readdir(OUT)).filter(f=>/^\d{4}-\d\d-\d\d\.json$/.test(f)&&f!==date+".json").sort().slice(-14);
  previous=await Promise.all(files.map(async f=>JSON.parse(await readFile(join(OUT,f),"utf8"))));
} catch(e){if(e?.code!=="ENOENT")throw e}
let drafted=await draftWithDeepSeek(ledger,{previousReports:previous});
const document={
  format:"CUPOLA_DAILY_EDITORIAL_DRAFT_V1",
  day:date,
  routeCandidate:"/earth/daily/"+date,
  pageStatus:"DRAFT_ONLY",
  indexApproved:false,
  publishApprovedAt:null,
  screenshotManifestKey:null,
  editorial: drafted,
  ledger,
  disclosure:"All observation, model, forecast and render timestamps are distinct. This draft is NOT a globally exhaustive daily Earth census."
};
const output=JSON.stringify(document,null,2)+"\n";
if(dryRun) {
  console.log("DRY_RUN_OUTPUT",output.length,"bytes, no published URL, no sitemap change");
} else {
  await mkdir(OUT,{recursive:true});
  await writeFile(join(OUT,date+".json"),output,"utf8");
  console.log("WROTE_UNPUBLISHED_DRAFT",join(OUT,date+".json"));
}
