import { NextResponse } from "next/server";

/**
 * Same-origin, CDN-cacheable lunar albedo from NASA's LRO/LROC global mosaic.
 * 2025 color map (equirectangular, 2048x1024), not a live observation.
 * Credits: NASA Scientific Visualization Studio / Ernie Wright / Noah Petro.
 * https://svs.gsfc.nasa.gov/4720/
 */
const LROC_URL="https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg";
export const revalidate=604800;
export async function GET(){
  try{
    const res=await fetch(LROC_URL,{
      next:{revalidate:604800},
      signal:AbortSignal.timeout(9000),
    });
    if(!res.ok)throw Error("NASA lunar source unavailable");
    const buf=new Uint8Array(await res.arrayBuffer());
    if(buf.length<50_000||buf.length>2_000_000||buf[0]!==0xff||buf[1]!==0xd8)
      throw Error("Unexpected lunar texture payload");
    return new NextResponse(buf,{
      status:200,
      headers:{
        "Content-Type":"image/jpeg",
        "Cache-Control":"public, s-maxage=604800, stale-while-revalidate=2592000",
        "X-Cupola-Lunar-Source":"NASA-SVS-LROC-2025",
        "X-Content-Type-Options":"nosniff",
      },
    });
  }catch{
    // Never replace an image with a fake 1x1 successful response.
    // The R3F client retains its lightweight illustrative map as fallback.
    return NextResponse.json({error:"lunar-texture-unavailable"},{
      status:503,
      headers:{"Cache-Control":"no-store","Retry-After":"300"},
    });
  }
}
