import { NextRequest, NextResponse } from "next/server";

export const revalidate = 3600;

const FALLBACK =
  "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg";

function yyyyMmDd(date: Date) {
  return date.toISOString().slice(0, 10);
}

const LIVE_LAYERS = [
  "VIIRS_NOAA21_CorrectedReflectance_TrueColor",
  "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
  "VIIRS_SNPP_CorrectedReflectance_TrueColor",
] as const;

/** NRT land/ocean SURFACE snapshot; raw true-color swaths contain real clouds.
 * Opt-in only! Never overwrite the existing cloud-free cinematic globe.
 * Daily layer dates ≠ real per-pixel acquisition timestamps.
 */
async function getRecentViirs(request: NextRequest) {
  const now=new Date();
  const metadataOnly=request.nextUrl.searchParams.get("meta")==="1";
  const requestedDay=request.nextUrl.searchParams.get("daysAgo");
  // Explicit day selection keeps source headers and image synchronized;
  // default prefers the last *completed* UTC day over a sparse current swath.
  const daysToTry=requestedDay!==null
    ? (/^[0-3]$/.test(requestedDay)?[Number(requestedDay)]:[])
    : [1,0,2,3];
  if(!daysToTry.length)return NextResponse.json(
    {error:"daysAgo must be 0, 1, 2 or 3"}, {status:400});
  for(const daysAgo of daysToTry) {
    const date=new Date(now);date.setUTCDate(date.getUTCDate()-daysAgo);
    const day=yyyyMmDd(date);
    for(const layer of LIVE_LAYERS) {
      const url=new URL("https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi");
      url.searchParams.set("SERVICE","WMS");
      url.searchParams.set("VERSION","1.1.1");
      url.searchParams.set("REQUEST","GetMap");
      url.searchParams.set("LAYERS",layer);
      url.searchParams.set("STYLES","");
      url.searchParams.set("SRS","EPSG:4326");
      url.searchParams.set("BBOX","-180,-90,180,90");
      url.searchParams.set("WIDTH","2048");
      url.searchParams.set("HEIGHT","1024");
      url.searchParams.set("FORMAT","image/jpeg");
      url.searchParams.set("TIME",day);
      try {
        const response=await fetch(url,{
          next:{revalidate:1800},
          signal:AbortSignal.timeout(12500),
          headers:{"User-Agent":"CUPOLA-Earth-Experience/1.0"},
        });
        const type=response.headers.get("content-type")||"";
        if(!response.ok||!type.toLowerCase().includes("image/jpeg"))continue;
        const body=await response.arrayBuffer();
        if(body.byteLength<25_000||body.byteLength>16_000_000)continue;
        const meta={
          kind:"surface" as const,status:"daily-satellite" as const,
          source:"NASA GIBS / VIIRS",layer,imageryDate:day,
          verifiedPixelTime:false as const,latestPixelObservationUnknown:true as const,
          gapFilled:false,
        };
        if(metadataOnly)return NextResponse.json(meta,{
          headers:{"Cache-Control":"public, s-maxage=900"},
        });
        return new NextResponse(body,{status:200,headers:{
          "Content-Type":"image/jpeg",
          "Cache-Control":"public, s-maxage=1800, stale-while-revalidate=3600",
          "X-Cupola-Source":"NASA GIBS / VIIRS · "+layer,
          "X-Cupola-Imagery-Date":day,
          "X-Cupola-Quality":"daily-truecolor-swaths-contain-clouds-and-nodata",
          "X-Cupola-Data-Status":"raw-partial-viirs-orbit-swaths-not-global-surface",
        }});
      } catch { /* Try another actual public NRT product. */ }
    }
  }
  if(metadataOnly)return NextResponse.json({
    kind:"surface",status:"not-available",source:"NASA GIBS / VIIRS",
    latestPixelObservationUnknown:true,verifiedPixelTime:false,
  },{status:503,headers:{"Cache-Control":"no-store"}});
  return new NextResponse(null,{status:204,headers:{
    "Cache-Control":"no-store",
    "X-Cupola-Data-Status":"no-verified-recent-viirs-scene",
  }});
}

export async function GET(request: NextRequest) {
  if(request.nextUrl.searchParams.get("mode")==="live")
    return getRecentViirs(request);

  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  const time = yyyyMmDd(date);

  const url = new URL("https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi");
  url.searchParams.set("SERVICE", "WMS");
  url.searchParams.set("VERSION", "1.1.1");
  url.searchParams.set("REQUEST", "GetMap");
  url.searchParams.set("LAYERS", "MODIS_Terra_CorrectedReflectance_TrueColor");
  url.searchParams.set("STYLES", "");
  url.searchParams.set("SRS", "EPSG:4326");
  url.searchParams.set("BBOX", "-180,-90,180,90");
  url.searchParams.set("WIDTH", "2048");
  url.searchParams.set("HEIGHT", "1024");
  url.searchParams.set("FORMAT", "image/jpeg");
  url.searchParams.set("TIME", time);

  try {
    let response = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "CUPOLA-Earth-Experience/1.0" },
    });

    let source = "NASA GIBS";
    const primaryType = response.headers.get("content-type") || "";
    if (!response.ok || !primaryType.includes("image")) {
      response = await fetch(FALLBACK, { next: { revalidate: 86400 } });
      source = "Fallback Earth texture";
    }

    const finalType = response.headers.get("content-type") || "";
    if (!response.ok || !finalType.includes("image")) throw new Error("Satellite imagery unavailable");
    const body = await response.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Cupola-Imagery-Date": time,
        "X-Cupola-Source": source,
      },
    });
  } catch {
    try {
      const fallback = await fetch(FALLBACK, { next: { revalidate: 86400 } });
      const body = await fallback.arrayBuffer();
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": fallback.headers.get("content-type") || "image/jpeg",
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          "X-Cupola-Source": "Fallback Earth texture",
        },
      });
    } catch {
      const pixel = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XqQfWQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
      return new NextResponse(pixel, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
          "X-Cupola-Source": "Emergency texture fallback",
        },
      });
    }
  }
}
