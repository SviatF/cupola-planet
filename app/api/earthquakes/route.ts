import { NextResponse } from "next/server";
import { parseUsgsRecentEarthquakes } from "@/lib/earth/usgsEarthquakeFeed";
export const dynamic="force-dynamic";
const USGS_URL="https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";

export async function GET(){
  try {
    const response=await fetch(USGS_URL,{
      headers:{"User-Agent":"CUPOLA Earth viewer"},
      next:{revalidate:60},
      signal:AbortSignal.timeout(10000)
    });
    if(!response.ok)throw Error("USGS upstream unavailable");
    const source=await response.json() as unknown;
    const data=parseUsgsRecentEarthquakes(source,Date.now());
    return NextResponse.json({
      ...data,
      source:"USGS Earthquake Hazards Program",
      fetchedAt:new Date().toISOString(),
      dataStatus:"SOURCE_VERIFIED_RECENT"
    },{headers:{"Cache-Control":"public, max-age=0, s-maxage=60, stale-while-revalidate=60"}});
  }catch {
    // An upstream outage or malformed/stale feed must never appear as
    // "zero earthquakes" with a freshly generated data timestamp.
    return NextResponse.json({
      earthquakes:[],source:"USGS Earthquake Hazards Program",
      provenance:"UNAVAILABLE",dataStatus:"SOURCE_UNAVAILABLE"
    },{status:503,headers:{"Cache-Control":"public, max-age=0, s-maxage=60"}});
  }
}
