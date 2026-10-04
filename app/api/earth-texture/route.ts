import { NextRequest, NextResponse } from "next/server";

export const revalidate = 86400;

const SOURCES: Record<string, string> = {
  day: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg",
  night: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_lights_2048.png",
  clouds: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_clouds_1024.png",
};

const TRANSPARENT =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XqQfWQAAAABJRU5ErkJggg==";

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") || "";
  const source = SOURCES[type];

  if (!source) {
    return NextResponse.json({ error: "Unknown texture" }, { status: 400 });
  }

  try {
    const response = await fetch(source, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error("Texture unavailable");
    const body = await response.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") || "image/png",
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        "X-Cupola-Texture": type,
      },
    });
  } catch {
    const transparent = Uint8Array.from(atob(TRANSPARENT), (c) => c.charCodeAt(0));
    return new NextResponse(transparent, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        "X-Cupola-Texture": type + "-fallback",
      },
    });
  }
}
