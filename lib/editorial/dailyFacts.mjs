import { createHash } from "node:crypto";

const ORIGIN = "https://cupola.earth";
export const MAX_FACT_AGE_HOURS = 36;
export const REPORT_SCHEMA = 1;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const sourceDefs = Object.freeze({
  earthquakes: { label: "USGS Earthquake Hazards Program", url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson", coverage: "Selected M2.5+ earthquakes from the time-limited USGS feed; NOT a global census." },
  storms: { label: "NOAA National Hurricane Center", url: "https://www.nhc.noaa.gov/", coverage: "NHC tropical cyclone advisories only; not all global ocean basins." },
  wildfires: { label: "NASA FIRMS / GDACS / NASA EONET", url: "https://firms.modaps.eosdis.nasa.gov/", coverage: "VIIRS thermal detections or reported incidents depending on available mode; NOT confirmed worldwide fire counts." },
  aurora: { label: "NOAA SWPC OVATION", url: "https://www.swpc.noaa.gov/products/aurora-30-minute-forecast", coverage: "Aurora probability FORECAST, not a photographed observation." },
});

export function utcWindow(day) {
  if (typeof day !== "string" || !ISO_DAY.test(day)) throw Error("Invalid UTC report day");
  const start = Date.parse(day + "T00:00:00.000Z");
  if (!Number.isFinite(start) || new Date(start).toISOString().slice(0,10) !== day)
    throw Error("Invalid calendar date");
  return { start, end: start + 86_400_000 };
}
export function previousUtcDay(now = new Date()) {
  return new Date(Date.parse(now.toISOString().slice(0,10) + "T00:00:00Z") - 86_400_000).toISOString().slice(0,10);
}
function isoTime(value) {
  const ms = typeof value === "number" ? value : Date.parse(value ?? "");
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
function safeLine(value, max = 150) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f<>]/g," ").replace(/\s+/g," ").trim().slice(0,max);
}
function validPoint(lat,lon) {
  return typeof lat==="number" && typeof lon==="number" && Number.isFinite(lat) &&
    Number.isFinite(lon) && lat>=-90 && lat<=90 && lon>=-180 && lon<=180;
}
function fromDay(ts, window, now) {
  const ms = Date.parse(ts ?? "");
  return Number.isFinite(ms) && ms>=window.start && ms<window.end && ms<=now+300_000;
}
function boundedSourceTime(value, now, maxAgeHours = MAX_FACT_AGE_HOURS) {
  const iso=isoTime(value);
  const ms=Date.parse(iso ?? "");
  return iso && ms<=now+300_000 && ms>=now-maxAgeHours*3_600_000 ? iso : null;
}
function normalizedFact({id,kind,source,occurredAt,headline,explanation,lat,lon,sourceUrl,measurements={},dataMode="observed"}) {
  return {id,kind,source,occurredAt,headline:safeLine(headline,200),
    explanation:safeLine(explanation,300),
    ...(validPoint(lat,lon)?{latitude:lat,longitude:lon}:{}),
    sourceUrl,measurements,dataMode};
}
const stamp = (a) => isoTime(a);
export function buildFactLedger(day, snapshots, now=Date.now()) {
  const window=utcWindow(day);
  if (!Number.isFinite(now) || now < window.end + 20*60_000)
    throw Error("Complete UTC day and post-day source latency are required");
  if (now > window.end + MAX_FACT_AGE_HOURS*3_600_000)
    throw Error("Daily ingest too late: rolling source windows cannot reconstruct a reliable archive");

  const facts=[];
  const sources=[];
  const unavailable=[];
  const addSource=(id,asOf,mode,count,extra={})=>sources.push({
    id,name:sourceDefs[id].label,url:sourceDefs[id].url,coverage:sourceDefs[id].coverage,
    asOf,lagMinutes:Math.max(0,Math.floor((now-Date.parse(asOf))/60_000)),
    mode,verifiedSelectedFacts:count,...extra
  });
  const usgs=snapshots.earthquakes;
  const usgsAsOf=usgs?.dataStatus==="SOURCE_VERIFIED_RECENT" &&
    usgs?.provenance==="USGS_GEOJSON_VERIFIED" ?
    boundedSourceTime(usgs.sourceGeneratedAt,now,2):null;
  if(usgsAsOf && Array.isArray(usgs.earthquakes)) {
    const list=usgs.earthquakes.filter(e=>Number.isFinite(e?.time) &&
      fromDay(stamp(e.time),window,now) && validPoint(e.latitude,e.longitude) &&
      typeof e.magnitude==="number" && e.magnitude>=2.5 && e.magnitude<=10 &&
      typeof e.id==="string" && e.id.length<=90)
      .sort((a,b)=>b.magnitude-a.magnitude||b.time-a.time).slice(0,8);
    for(const q of list) {
      const url=typeof q.url==="string"&&/^https:\/\/(?:earthquake\.usgs\.gov|www\.usgs\.gov)\//.test(q.url)
        ?q.url:sourceDefs.earthquakes.url;
      facts.push(normalizedFact({
        id:"usgs:"+safeLine(q.id,90),kind:"earthquake",source:"earthquakes",
        occurredAt:stamp(q.time),lat:q.latitude,lon:q.longitude,sourceUrl:url,
        headline:"M"+q.magnitude.toFixed(1)+" earthquake — "+safeLine(q.place,115),
        explanation:"USGS reported a magnitude "+q.magnitude.toFixed(1)+
          " earthquake at "+stamp(q.time)+" with a reported depth of "+
          Number(q.depth).toFixed(1)+" km.",
        measurements:{magnitude:q.magnitude,depthKm:q.depth},
      }));
    }
    addSource("earthquakes",usgsAsOf,"USGS_VERIFIED_GEOJSON",list.length,
      {limitations:"Largest eight eligible verified events, not total daily global earthquakes."});
  } else unavailable.push("earthquakes");

  const storms=snapshots.storms;
  if(storms?.dataStatus==="official-advisories" && Array.isArray(storms.storms) &&
    boundedSourceTime(storms.updatedAt,now,2)) {
    const list=storms.storms.filter(e=>{
      const at=stamp(e?.advisoryTime);
      return fromDay(at,window,now) && validPoint(e.latitude,e.longitude) &&
        typeof e.id==="string" && typeof e.name==="string" && e.id.length<100;
    }).sort((a,b)=>String(b.advisoryTime).localeCompare(String(a.advisoryTime))).slice(0,8);
    for(const s of list)facts.push(normalizedFact({
      id:"nhc:"+safeLine(s.id,90),kind:"storm-advisory",source:"storms",
      occurredAt:stamp(s.advisoryTime),lat:s.latitude,lon:s.longitude,
      sourceUrl:sourceDefs.storms.url,
      headline:"NHC advisory: "+safeLine(s.name,100),
      explanation:"NOAA NHC advisory issued at "+stamp(s.advisoryTime)+
        " for "+safeLine(s.name,90)+". Forecast track is not an observed path.",
      measurements:{windKnots:Number.isFinite(s.windKnots)?s.windKnots:null},
      dataMode:"official-advisory",
    }));
    // A valid empty NHC feed cannot be extrapolated to "no storms worldwide."
    if(boundedSourceTime(storms.updatedAt,now,2))
      addSource("storms",stamp(storms.updatedAt),"NOAA_NHC_ADVISORY",list.length);
    else unavailable.push("storms");
  } else unavailable.push("storms");

  const fires=snapshots.wildfires;
  const wildfireMode=fires?.mode==="firms"?"thermal-detection":
    fires?.mode==="reported-incidents"?"incident-report":null;
  if(wildfireMode && Array.isArray(fires.hotspots) &&
    boundedSourceTime(fires.updatedAt,now,6) &&
    (wildfireMode!=="thermal-detection" ||
      ["satellite-nrt","satellite-recent"].includes(fires.dataStatus))) {
    const list=fires.hotspots.filter(e=>fromDay(e?.acquiredAt,window,now) &&
      validPoint(e.latitude,e.longitude) && typeof e.id==="string" && e.id.length<100)
      .sort((a,b)=>String(b.acquiredAt).localeCompare(String(a.acquiredAt))).slice(0,8);
    for(const w of list) facts.push(normalizedFact({
      id:"fire:"+safeLine(w.id,90),kind:wildfireMode,source:"wildfires",
      occurredAt:stamp(w.acquiredAt),lat:w.latitude,lon:w.longitude,
      sourceUrl:sourceDefs.wildfires.url,
      headline:wildfireMode==="thermal-detection"?
        "Satellite thermal anomaly observation":"Reported wildfire incident",
      explanation:wildfireMode==="thermal-detection"?
        "NASA FIRMS time-tagged thermal detection; not a mapped confirmed fire perimeter.":
        "GDACS / NASA EONET reported wildfire incident; not a direct satellite hotspot.",
      measurements:{frp:Number.isFinite(w.frp)?w.frp:null},dataMode:wildfireMode
    }));
    const updated=boundedSourceTime(fires.updatedAt,now,6);
    if(updated)addSource("wildfires",updated,wildfireMode,list.length,
      {limitations:wildfireMode==="incident-report"?"Incident reporting; not instrument measurements.":
        "VIIRS thermal detections; not confirmed fire boundaries."});
    else unavailable.push("wildfires");
  } else unavailable.push("wildfires");

  const aurora=snapshots.aurora;
  const auroraAsOf=aurora?.dataStatus==="forecast"?
    boundedSourceTime(aurora.observationTime,now,MAX_FACT_AGE_HOURS):null;
  if(auroraAsOf && fromDay(auroraAsOf,window,now) &&
      isoTime(aurora.forecastTime) && Array.isArray(aurora.points) &&
      aurora.points.length>100){
    const peak=aurora.points.filter(p=>Number.isFinite(p?.intensity)).reduce(
      (v,p)=>Math.max(v,p.intensity),0);
    if(peak>=8 && peak<=100)facts.push(normalizedFact({
      id:"ovation:"+auroraAsOf,kind:"aurora-forecast",source:"aurora",
      occurredAt:auroraAsOf,sourceUrl:sourceDefs.aurora.url,
      headline:"NOAA aurora probability forecast",
      explanation:"OVATION aurora probability model, based on solar-wind measurements; not a photographed aurora sighting.",
      measurements:{sampledPeakProbability:peak},dataMode:"forecast",
    }));
    addSource("aurora",auroraAsOf,"FORECAST_NOT_OBSERVATION",1,
      {forecastValidAt:isoTime(aurora.forecastTime)});
  } else unavailable.push("aurora");

  const unique=[...new Map(facts.map(f=>[f.id,f])).values()]
    .sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)||a.id.localeCompare(b.id));
  const independentSources=new Set(unique.map(f=>f.source));
  const quality={
    facts:unique.length,
    independentSources:independentSources.size,
    enoughForDraft:unique.length>=3,
    eligibleForEditorialReview:unique.length>=5 && independentSources.size>=2,
    indexApproved:false,
    reasons:[],
  };
  if(!quality.enoughForDraft)quality.reasons.push("insufficient-verified-events");
  if(independentSources.size<2)quality.reasons.push("insufficient-independent-source-diversity");
  // Report content is a reproducible digest of an immutable day-window.
  const digest=createHash("sha256").update(JSON.stringify({day,facts:unique})).digest("hex");
  return {schemaVersion:REPORT_SCHEMA,day,periodStart:new Date(window.start).toISOString(),
    periodEndExclusive:new Date(window.end).toISOString(),compiledAt:new Date(now).toISOString(),
    digest,origin:ORIGIN,
    title:"Earth on "+new Date(window.start).toLocaleDateString("en-US",{timeZone:"UTC",month:"long",day:"numeric",year:"numeric"}),
    facts:unique,sources,unavailableSources:unavailable,
    coverageNote:"Selected verified source observations and reports, not a full global census. Times are UTC.",
    quality};
}
export function validateLedger(ledger) {
  if(!ledger || ledger.schemaVersion!==1 || !Array.isArray(ledger.facts) ||
    !Array.isArray(ledger.sources) || ledger.quality?.indexApproved!==false)throw Error("Invalid ledger");
  const {start,end}=utcWindow(ledger.day);
  for(const fact of ledger.facts) {
    if(!fact.sourceUrl?.startsWith("https://") || !sourceDefs[fact.source] ||
      fact.sourceUrl.includes("javascript:") || !fact.id || !fact.occurredAt ||
      Date.parse(fact.occurredAt)<start || Date.parse(fact.occurredAt)>=end)
      throw Error("Unverifiable daily fact");
  }
  const actual=createHash("sha256").update(JSON.stringify({day:ledger.day,facts:ledger.facts})).digest("hex");
  if(actual!==ledger.digest)throw Error("Facts changed since checksum");
  return true;
}
