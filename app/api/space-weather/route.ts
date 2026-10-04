import { NextResponse } from "next/server";

export const revalidate = 60;

export async function GET() {
  try {
    const response = await fetch("https://services.swpc.noaa.gov/json/planetary_k_index_1m.json", {
      next: { revalidate: 60 },
      headers: { "User-Agent": "CUPOLA-Earth-Experience/1.0" },
    });

    if (!response.ok) throw new Error("NOAA SWPC unavailable");
    const rows = await response.json();
    const latest = Array.isArray(rows) ? rows[rows.length - 1] : null;
    const kp = Number(latest?.kp_index ?? latest?.estimated_kp ?? latest?.kp ?? 0);
    const timeTag = String(latest?.time_tag ?? latest?.time ?? new Date().toISOString());

    return NextResponse.json({
      kp: Number.isFinite(kp) ? kp : 0,
      updatedAt: timeTag,
      source: "NOAA SWPC",
    });
  } catch {
    return NextResponse.json({ error: "Space weather unavailable" }, { status: 503 });
  }
}
