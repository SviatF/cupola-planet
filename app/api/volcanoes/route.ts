import { NextResponse } from "next/server";
import { earthSourceTime, sourceAgeMinutes } from "@/lib/earth/eventDataFreshness";
import { fetchGdacsVolcanoAdvisories } from "@/lib/earth/gdacsVolcano";

export const revalidate = 300;

const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events?category=volcanoes&status=open&limit=200";

type VolcanoEvent = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  eventTime: string | null;
  magnitude: number | null;
  source: string;
  sourceUrl: string | null;
};

function centroidFromGeometry(geometry: any): { latitude: number; longitude: number } | null {
  const coordinates = geometry?.coordinates;
  if (!coordinates) return null;

  if (geometry.type === "Point" && Array.isArray(coordinates) && coordinates.length >= 2) {
    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    return Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { latitude, longitude }
      : null;
  }

  const flattened: number[][] = [];
  const walk = (value: any) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      flattened.push([value[0], value[1]]);
      return;
    }
    value.forEach(walk);
  };
  walk(coordinates);

  if (!flattened.length) return null;

  const longitude = flattened.reduce((sum, point) => sum + point[0], 0) / flattened.length;
  const latitude = flattened.reduce((sum, point) => sum + point[1], 0) / flattened.length;

  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
}

function parseMagnitude(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function GET() {
  // Fetch two independent no-key publishers. A source outage is not "zero eruptions".
  const gdacsTask=fetchGdacsVolcanoAdvisories().catch(()=>null);
  let eonetOk=false;
  let nasa: Array<VolcanoEvent & {
    dataStatus:"recent-report"|"historical-report";reportAgeMinutes:number|null;
  }>=[];
  try {
    const response = await fetch(EONET_URL, {
      next: { revalidate: 600 },
      headers: { Accept: "application/json", "User-Agent": "CUPOLA-Earth-Viewer/1.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (response.ok) {
      const payload = await response.json();
      if (!Array.isArray(payload?.events)) throw Error("Invalid EONET events response");
      eonetOk=true;
      nasa=payload.events.flatMap((event: any, eventIndex: number) => {
        const geometries = Array.isArray(event?.geometry) ? event.geometry : [];
        const latest = [...geometries].sort((a,b)=>
          (Date.parse(String(b?.date||""))||0)-(Date.parse(String(a?.date||""))||0))[0];
        const point = centroidFromGeometry(latest);
        if (!point) return [];
        const time = earthSourceTime(latest?.date);
        const age = sourceAgeMinutes(time);
        if (age === null || age > 30*24*60) return [];
        const first = Array.isArray(event?.sources) ? event.sources[0] : null;
        return [{
          id:"eonet:"+String(event?.id || "volcano-" + eventIndex),
          name:String(event?.title || event?.name || "Reported volcano").slice(0,120),
          ...point,
          eventTime:time,
          magnitude:parseMagnitude(latest?.magnitudeValue),
          source:typeof first?.id === "string" ? "NASA EONET / " + first.id : "NASA EONET",
          sourceUrl:typeof first?.url==="string"&&first.url.startsWith("https://")?first.url:null,
          dataStatus:age<=48*60?"recent-report" as const:"historical-report" as const,
          reportAgeMinutes:age,
        }];
      });
    }
  } catch { /* GDACS may still be current. */ }
  const gdacs=await gdacsTask;
  if (!eonetOk && gdacs === null) return NextResponse.json({
    volcanoes:[],source:"GDACS / NASA EONET",dataStatus:"offline",
    updatedAt:new Date().toISOString(),error:"Volcano source unavailable",
  },{status: 503,headers:{"Cache-Control":"no-store"}});

  const all=[...(gdacs??[]),...nasa];
  const volcanoes=all
    .sort((a,b)=>(b.eventTime||"").localeCompare(a.eventTime||""))
    .slice(0,80);
  const recentReportCount=volcanoes.filter(x=>x.dataStatus==="recent-report").length;
  return NextResponse.json({
    volcanoes, source:"GDACS/VAAC + NASA EONET",
    latestReportAt:volcanoes[0]?.eventTime??null,
    recentReportCount, dataStatus:recentReportCount?"recent-reports":"historical-reports",
    sourceAvailability:{gdacs:gdacs!==null,eonet:eonetOk},
    updatedAt:new Date().toISOString(),
    disclaimer:"An active/updated volcanic report does not prove a continuing eruption",
  },{headers:{
    "Cache-Control":"public, s-maxage=300, stale-while-revalidate=600",
    "X-Cupola-Data-Status":recentReportCount?"recent-verified-reports":"historical-reports-not-live",
  }});
}
