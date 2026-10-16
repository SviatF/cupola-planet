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
const SENSOR_LAYERS: Record<string, typeof LIVE_LAYERS[number]> = {
  noaa21: LIVE_LAYERS[0], noaa20: LIVE_LAYERS[1], snpp: LIVE_LAYERS[2],
};

/** NRT VIIRS True Color shows DAILY ORBIT SWATHS, not full globe surface.
 * Select a satellite+UTC date explicitly to avoid blindly taking a mostly
 * empty NOAA-21 swath and ignoring other active satellite acquisitions.
 * 512x256 probe lets clients audit valid imagery without downloading many
 * full-resolution frames. Original 2048x1024 remains available by URL.
 */
async function getRecentViirs(request: NextRequest) {
  const query=request.nextUrl.searchParams;
  const metadataOnly=query.get("meta")==="1";
  const probe=query.get("resolution")==="probe";
  const rawSensor=query.get("sensor");
  const rawAge=query.get("daysAgo");
  if (rawSensor!==null && !Object.hasOwn(SENSOR_LAYERS,rawSensor))
    return NextResponse.json({error:"sensor must be noaa21, noaa20 or snpp"},{status:400});
  if (rawAge!==null && !/^[0-6]$/.test(rawAge))
    return NextResponse.json({error:"daysAgo must be 0..6"},{status:400});
  const today=new Date();
  const dates=rawAge!==null ? [Number(rawAge)] : [1,0,2,3];
  const sensors=rawSensor!==null ? [rawSensor] : ["noaa21","noaa20","snpp"];
  const dimensions=probe ? {w:512,h:256} : {w:2048,h:1024};

  for (const daysAgo of dates) {
    const date=new Date(today);date.setUTCDate(date.getUTCDate()-daysAgo);
    const day=yyyyMmDd(date);
    for(const sensor of sensors) {
      const layer=SENSOR_LAYERS[sensor];
      const url=new URL("https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi");
      for(const [key,value] of Object.entries({
        SERVICE:"WMS",VERSION:"1.1.1",REQUEST:"GetMap",LAYERS:layer,
        STYLES:"",SRS:"EPSG:4326",BBOX:"-180,-90,180,90",
        WIDTH:String(dimensions.w),HEIGHT:String(dimensions.h),
        FORMAT:"image/jpeg",TIME:day,
      }))url.searchParams.set(key,value);
      try {
        const response=await fetch(url,{
          next:{revalidate:1800},signal:AbortSignal.timeout(13000),
          headers:{"User-Agent":"CUPOLA-Earth-Experience/1.0"},
        });
        const type=(response.headers.get("content-type")||"").toLowerCase();
        if(!response.ok||!type.includes("image/jpeg"))continue;
        const body=await response.arrayBuffer();
        const minBytes=probe?1200:25000;
        if(body.byteLength<minBytes||body.byteLength>16_000_000)continue;
        // Data are image bytes from the selected layer/date, not proof that
        // any pixels were observed. Browser coverage probe must inspect them.
        const metadata={
          kind:"surface" as const,status:"daily-satellite" as const,
          source:"NASA GIBS / VIIRS",layer,imageryDate:day,
          verifiedPixelTime:false as const,latestPixelObservationUnknown:true as const,
          gapFilled:false,
        };
        if(metadataOnly)return NextResponse.json(metadata,{
          headers:{"Cache-Control":"public, s-maxage=900"},
        });
        return new NextResponse(body,{status:200,headers:{
          "Content-Type":"image/jpeg",
          "Cache-Control":"public, s-maxage=900, stale-while-revalidate=1200",
          "X-Cupola-Source":"NASA GIBS / VIIRS · "+layer,
          "X-Cupola-Sensor":sensor,
          "X-Cupola-Imagery-Date":day,
          "X-Cupola-Raster-Width":String(dimensions.w),
          "X-Cupola-Raster-Height":String(dimensions.h),
          "X-Cupola-Quality":"daily-truecolor-swaths-contain-clouds-and-nodata",
          "X-Cupola-Data-Status":"raw-partial-viirs-orbit-swaths-not-global-surface",
          "X-Cupola-Observation-Status":"pixel-presence-not-verified",
        }});
      } catch {/* no invented fallback; try the next verified satellite/day */ }
    }
  }
  if(metadataOnly)return NextResponse.json({
    kind:"surface",status:"not-available",source:"NASA GIBS / VIIRS",
    latestPixelObservationUnknown:true,verifiedPixelTime:false,
  },{status:503,headers:{"Cache-Control":"no-store"}});
  return new NextResponse(null,{status:204,headers:{
    "Cache-Control":"no-store",
    "X-Cupola-Data-Status":"no-verified-viirs-raster",
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
