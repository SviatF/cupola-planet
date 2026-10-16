import { earthSourceTime, sourceAgeMinutes } from "@/lib/earth/eventDataFreshness";

export type GdacsVolcanoAlert = {
  id:string;name:string;latitude:number;longitude:number;
  eventTime:string;magnitude:null;source:string;sourceUrl:string;
  dataStatus:"recent-report"|"historical-report";reportAgeMinutes:number;
};

/** Public GDACS/EC-JRC advisories (VAAC ash + Smithsonian reports), no key.
 * Search returns GeoJSON. An alert is NOT a continuous eruption sensor.
 * Source may be unavailable or empty; caller must never invent a volcano.
 */
export async function fetchGdacsVolcanoAdvisories(): Promise<GdacsVolcanoAlert[]> {
  const today = new Date(), start = new Date(Date.now() - 14 * 86400_000);
  const params = new URLSearchParams({
    eventlist:"VO",fromdate:start.toISOString().slice(0,10),
    todate:today.toISOString().slice(0,10),
  });
  const url = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/search?" + params;
  const response = await fetch(url,{
    next:{revalidate:600},signal:AbortSignal.timeout(12000),
    headers:{Accept:"application/json", "User-Agent":"CUPOLA-Earth-Viewer/1.0"},
  });
  if (!response.ok) throw new Error("GDACS HTTP error");
  const data = await response.json();
  if (data?.type !== "FeatureCollection" || !Array.isArray(data?.features))
    throw new Error("GDACS invalid GeoJSON");
  return data.features.flatMap((feature:any)=>{
    if (feature?.geometry?.type !== "Point" ||
      !Array.isArray(feature.geometry.coordinates)) return [];
    const p = feature.properties || {};
    const kind = String(p.eventtype ?? p.eventType ?? p.event_type ?? "").toUpperCase();
    if (kind !== "VO") return [];
    const lon=Number(feature.geometry.coordinates[0]);
    const lat=Number(feature.geometry.coordinates[1]);
    if (!Number.isFinite(lat)||!Number.isFinite(lon)||lat < -90||lat > 90||lon < -180||lon > 180) return [];
    const times=[p.pubdate,p.pubDate,p.fromdate,p.fromDate,
      p.todate,p.toDate,p.eventtime,p.eventTime,p.date]
      .map(earthSourceTime).filter((x):x is string=>x!==null);
    const eventTime=times.sort().at(-1);
    const age=sourceAgeMinutes(eventTime || null);
    if (!eventTime||age===null||age>30*24*60) return [];
    return [{
      id:"gdacs:"+String(p.eventid??p.eventId??feature.id??[lat,lon].join(":")),
      name:String(p.eventname||p.name||p.title||"Volcanic ash advisory").slice(0,120),
      latitude:lat,longitude:lon,eventTime,magnitude:null,
      source:"GDACS/VAAC volcanic advisory",sourceUrl:"https://www.gdacs.org/",
      dataStatus:age<=48*60?"recent-report" as const:"historical-report" as const,
      reportAgeMinutes:age,
    }];
  }).slice(0,80);
}
