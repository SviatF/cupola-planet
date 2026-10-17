import { NextResponse } from "next/server";

/**
 * NASA SVS CGI Moon Kit — LRO LOLA global height-map preview (1024x512).
 * Grayscale height data is used only for conservative lunar bump and micro-
 * displacement shading. It is NOT a high-resolution local terrain mesh.
 * https://svs.gsfc.nasa.gov/4720/
 */
const NASA_LOLA_URL="https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg";
export const revalidate=604800;

export async function GET(){
  try{
    const source=await fetch(NASA_LOLA_URL,{
      next:{revalidate:604800},
      signal:AbortSignal.timeout(9000),
    });
    if(!source.ok)throw Error("LOLA source offline");
    const bytes=new Uint8Array(await source.arrayBuffer());
    if(bytes.length<20_000||bytes.length>500_000||
      bytes[0]!==0xff||bytes[1]!==0xd8)
      throw Error("Unexpected LOLA image payload");

    return new NextResponse(bytes,{
      status:200,
      headers:{
        "Content-Type":"image/jpeg",
        "Cache-Control":"public, s-maxage=604800, stale-while-revalidate=2592000",
        "X-Cupola-Lunar-Relief-Source":"NASA-LRO-LOLA-SVS4720",
        "X-Content-Type-Options":"nosniff",
      },
    });
  }catch{
    return NextResponse.json({error:"lunar-relief-unavailable"},{
      status:503,
      headers:{"Cache-Control":"no-store","Retry-After":"300"},
    });
  }
}
