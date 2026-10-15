import { earthSourceTime, sourceAgeMinutes } from "@/lib/earth/eventDataFreshness";

type WildfireReport = {
  id:string; latitude:number;longitude:number;
  frp:null;brightness:null;confidence:"event";
  acquiredAt:string;daynight:null;satellite:"GDACS GWIS";
};
/** Keyless EC-JRC GDACS wildfire incidents.
 * Coordinates denote REPORTED INCIDENT CENTERS, not satellite fire pixels.
 * GWIS/GDACS covers only significant selected incidents, not all fires.
 */
export async function fetchGdacsWildfireReports(): Promise<WildfireReport[]> {
  const now=new Date(),start=new Date(Date.now()-7*86400_000);
  const params=new URLSearchParams({
    eventlist:"WF",fromdate:start.toISOString().slice(0,10),
    todate:now.toISOString().slice(0,10),
  });
  const response=await fetch(
    "https://www.gdacs.org/gdacsapi/api/events/geteventlist/search?"+params,{
      next:{revalidate:900}, signal:AbortSignal.timeout(12000),
      headers:{Accept:"application/json","User-Agent":"CUPOLA-Earth-Viewer/1.0"},
    });
  if(!response.ok)throw Error("GDACS wildfire source unavailable");
  const json=await response.json();
  if(json?.type!=="FeatureCollection"||!Array.isArray(json.features))
    throw Error("GDACS wildfires invalid GeoJSON");
  return json.features.flatMap((feature:any)=>{
    if(feature?.geometry?.type!=="Point"||
      !Array.isArray(feature.geometry.coordinates))return [];
    const p=feature.properties||{};
    const kind=String(p.eventtype??p.eventType??p.event_type??"").toUpperCase();
    if(kind!=="WF"&&kind!=="FF")return [];
    const lon=Number(feature.geometry.coordinates[0]),lat=Number(feature.geometry.coordinates[1]);
    if(!Number.isFinite(lon)||!Number.isFinite(lat)||lon < -180||lon>180||lat < -90||lat>90)return [];
    const timestamps=[p.pubdate,p.pubDate,p.fromdate,p.fromDate,p.todate,p.toDate,p.date]
      .map(earthSourceTime).filter((s):s is string=>s!==null);
    const acquiredAt=timestamps.sort().at(-1);
    const age=sourceAgeMinutes(acquiredAt||null);
    if(!acquiredAt||age===null||age>7*24*60)return [];
    return [{
      id:"gdacs:"+String(p.eventid??p.eventId??feature.id??[lat,lon].join(":")),
      latitude:lat,longitude:lon,frp:null,brightness:null,
      confidence:"event" as const,acquiredAt,daynight:null,satellite:"GDACS GWIS" as const,
    }];
  }).slice(0,220);
}
