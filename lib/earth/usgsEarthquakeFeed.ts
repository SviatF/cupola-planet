/**
 * Strict USGS Earthquake GeoJSON ingest for live globes.
 * NEVER synthesize event timestamps or magnitude from Date.now()/zero.
 * The HTTP fetch time is not the earthquake occurrence time.
 */
export type VerifiedEarthquake={
  id:string;latitude:number;longitude:number;depth:number;
  magnitude:number;place:string;time:number;url:string|null;
};
type ParsedFeed={
  earthquakes:VerifiedEarthquake[];
  sourceGeneratedAt:string;
  newestEventAt:string|null;
  oldestEventAt:string|null;
  provenance:"USGS_GEOJSON_VERIFIED";
};
export function parseUsgsRecentEarthquakes(input:unknown,nowMs=Date.now()):ParsedFeed {
  if(!input||typeof input!=="object"||!Number.isFinite(nowMs))
    throw Error("Invalid USGS feed");
  const payload=input as Record<string,unknown>;
  const metadata=payload.metadata as Record<string,unknown>|undefined;
  if(payload.type!=="FeatureCollection"||!Array.isArray(payload.features)||
    !metadata||typeof metadata.generated!=="number")
    throw Error("USGS is not a verified GeoJSON FeatureCollection");
  const generated=metadata.generated;
  if(!Number.isFinite(generated)||generated>nowMs+5*60000||
    generated<nowMs-2*3600000)
    throw Error("USGS feed publication timestamp stale or future-dated");
  const seen=new Set<string>();
  const quakes:VerifiedEarthquake[]=[];
  for(const raw of payload.features){
    if(!raw||typeof raw!=="object")continue;
    const f=raw as Record<string,unknown>;
    const props=f.properties as Record<string,unknown>|undefined;
    const geom=f.geometry as Record<string,unknown>|undefined;
    const coords=geom?.coordinates;
    if(geom?.type!=="Point"||!Array.isArray(coords)||coords.length<3)continue;
    const lon=coords[0],lat=coords[1],depthKm=coords[2];
    const mag=props?.mag,time=props?.time;
    if(typeof lon!=="number"||typeof lat!=="number"||typeof depthKm!=="number"||
      typeof mag!=="number"||typeof time!=="number"||
      ![lon,lat,depthKm,mag,time].every(Number.isFinite)||
      depthKm< -5||depthKm>800||
      lon< -180||lon>180||lat< -90||lat>90||
      mag<2.5||mag>10||time>nowMs+5*60000||
      time<nowMs-36*3600000)continue;
    const id=typeof f.id==="string"&&f.id.trim()?f.id:
      [String(time),lat.toFixed(5),lon.toFixed(5)].join(":");
    if(seen.has(id))continue;
    seen.add(id);
    const depth=depthKm;
    const rawUrl=props?.url;
    const url=typeof rawUrl==="string"&&/^https:\/\/(?:earthquake\.usgs\.gov|www\.usgs\.gov)\//.test(rawUrl)
      ?rawUrl:null;
    quakes.push({id,latitude:lat,longitude:lon,depth,magnitude:mag,
      place:typeof props?.place==="string"?props.place.slice(0,200):"Earthquake",
      time,url});
  }
  const earthquakes=quakes.sort((a,b)=>b.magnitude-a.magnitude||b.time-a.time).slice(0,180);
  const times=earthquakes.map(x=>x.time);
  return {
    earthquakes,
    sourceGeneratedAt:new Date(generated).toISOString(),
    newestEventAt:times.length?new Date(Math.max(...times)).toISOString():null,
    oldestEventAt:times.length?new Date(Math.min(...times)).toISOString():null,
    provenance:"USGS_GEOJSON_VERIFIED"
  };
}
