import { NextResponse } from "next/server";

export const revalidate = 10;

const ISS_ID = 25544;
const API_BASE = "https://api.wheretheiss.at/v1/satellites/" + ISS_ID;

type IssPosition = {
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  timestamp: number;
  visibility?: string;
  footprint?: number;
};

function validPosition(value: any): value is IssPosition {
  return [
    value?.latitude,
    value?.longitude,
    value?.altitude,
    value?.velocity,
    value?.timestamp,
  ].every((item) => Number.isFinite(Number(item)));
}

export async function GET() {
  try {
    const now = Math.floor(Date.now() / 1000);
    const offsetsMinutes = [-40, -30, -20, -10, 0, 10, 20, 30, 40, 50];
    const timestamps = offsetsMinutes.map((minutes) => now + minutes * 60);

    const response = await fetch(
      API_BASE + "/positions?timestamps=" + timestamps.join(",") + "&units=kilometers",
      {
        next: { revalidate: 10 },
        headers: {
          Accept: "application/json",
          "User-Agent": "CUPOLA-Earth-Experience/1.0",
        },
        signal: AbortSignal.timeout(12000),
      },
    );

    if (!response.ok) throw new Error("ISS upstream unavailable");

    const payload = await response.json();
    const positions: IssPosition[] = Array.isArray(payload)
      ? payload
          .filter(validPosition)
          .map((position) => ({
            latitude: Number(position.latitude),
            longitude: Number(position.longitude),
            altitude: Number(position.altitude),
            velocity: Number(position.velocity),
            timestamp: Number(position.timestamp),
            visibility: typeof position.visibility === "string" ? position.visibility : undefined,
            footprint: Number.isFinite(Number(position.footprint)) ? Number(position.footprint) : undefined,
          }))
          .sort((a, b) => a.timestamp - b.timestamp)
      : [];

    if (!positions.length) throw new Error("ISS position list empty");

    const current = positions.reduce((best, position) =>
      Math.abs(position.timestamp - now) < Math.abs(best.timestamp - now)
        ? position
        : best,
    );

    return NextResponse.json(
      {
        latitude: current.latitude,
        longitude: current.longitude,
        altitude: current.altitude,
        velocity: current.velocity,
        timestamp: current.timestamp,
        visibility: current.visibility ?? null,
        footprint: current.footprint ?? null,
        track: positions.map((position) => ({
          latitude: position.latitude,
          longitude: position.longitude,
          altitude: position.altitude,
          velocity: position.velocity,
          timestamp: position.timestamp,
        })),
        source: "WhereTheISS",
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        error: "ISS data unavailable",
        track: [],
        source: "WhereTheISS",
        updatedAt: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
