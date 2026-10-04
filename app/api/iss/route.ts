import { NextResponse } from "next/server";

export const revalidate = 10;

export async function GET() {
  try {
    const response = await fetch("https://api.wheretheiss.at/v1/satellites/25544", {
      next: { revalidate: 10 },
      headers: { "User-Agent": "CUPOLA-Earth-Experience/1.0" },
    });

    if (!response.ok) throw new Error("ISS upstream unavailable");
    const data = await response.json();

    return NextResponse.json({
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      altitude: Number(data.altitude),
      velocity: Number(data.velocity),
      timestamp: Number(data.timestamp),
    });
  } catch {
    return NextResponse.json({ error: "ISS data unavailable" }, { status: 503 });
  }
}
