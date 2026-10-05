import { NextResponse } from "next/server";

export const revalidate = 900;

const SERVICE =
  "https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer";

type ArcLayer = { id: number; name?: string | null };
type GeoFeature = {
  type?: string;
  geometry?: { type?: string; coordinates?: [number, number] };
  properties?: Record<string, unknown>;
};

type StormTrackPoint = {
  latitude: number;
  longitude: number;
  tau: number;
  windKnots: number | null;
  pressure: number | null;
  category: number | null;
  validTime: string | null;
};

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringValue(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function stormIdentity(properties: Record<string, unknown>, lat: number, lon: number) {
  const name =
    stringValue(properties.stormname) ||
    stringValue(properties.storm_name) ||
    stringValue(properties.name) ||
    "ACTIVE CYCLONE";

  const id =
    stringValue(properties.stormid) ||
    stringValue(properties.storm_id) ||
    stringValue(properties.idp_source) ||
    name + ":" + lat.toFixed(2) + ":" + lon.toFixed(2);

  return { id, name };
}

function trackPoint(feature: GeoFeature): StormTrackPoint | null {
  if (feature.geometry?.type !== "Point" || !Array.isArray(feature.geometry.coordinates)) return null;

  const lon = numberValue(feature.geometry.coordinates[0]);
  const lat = numberValue(feature.geometry.coordinates[1]);
  if (lat == null || lon == null) return null;

  const p = feature.properties || {};
  return {
    latitude: lat,
    longitude: lon,
    tau: numberValue(p.tau) ?? 0,
    windKnots: numberValue(p.maxwind) ?? numberValue(p.max_wind) ?? numberValue(p.wind),
    pressure: numberValue(p.mslp) ?? numberValue(p.pressure),
    category: numberValue(p.ssnum) ?? numberValue(p.category),
    validTime:
      stringValue(p.validtime) ||
      stringValue(p.valid_time) ||
      stringValue(p.fcsttime) ||
      stringValue(p.forecasttime) ||
      null,
  };
}

async function fetchJson(url: string, timeout = 12000) {
  const response = await fetch(url, {
    next: { revalidate: 900 },
    headers: {
      Accept: "application/json",
      "User-Agent": "CUPOLA-Earth-Viewer/1.0",
    },
    signal: AbortSignal.timeout(timeout),
  });

  if (!response.ok) return null;
  return response.json();
}

export async function GET() {
  try {
    const service = await fetchJson(SERVICE + "?f=pjson");
    const layers: ArcLayer[] = Array.isArray(service?.layers) ? service.layers : [];

    const forecastPointLayers = layers.filter((layer) => {
      const name = String(layer?.name || "").toLowerCase();
      return name.includes("forecast point");
    });

    const responses = await Promise.all(
      forecastPointLayers.map(async (layer) => {
        const params = new URLSearchParams({
          where: "1=1",
          outFields: "*",
          returnGeometry: "true",
          f: "geojson",
        });

        const data = await fetchJson(
          SERVICE + "/" + layer.id + "/query?" + params.toString(),
          10000,
        );

        return {
          layerId: layer.id,
          layerName: layer.name || "Forecast Points",
          features: Array.isArray(data?.features) ? (data.features as GeoFeature[]) : [],
        };
      }),
    );

    const grouped = new Map<string, {
      id: string;
      name: string;
      layerId: number;
      features: GeoFeature[];
    }>();

    for (const result of responses) {
      for (const feature of result.features) {
        const point = trackPoint(feature);
        if (!point) continue;
        const p = feature.properties || {};
        const identity = stormIdentity(p, point.latitude, point.longitude);
        const existing = grouped.get(identity.id);

        if (existing) {
          existing.features.push(feature);
        } else {
          grouped.set(identity.id, {
            id: identity.id,
            name: identity.name,
            layerId: result.layerId,
            features: [feature],
          });
        }
      }
    }

    const storms = [];

    for (const group of grouped.values()) {
      const points = group.features
        .map((feature) => ({ feature, point: trackPoint(feature) }))
        .filter((entry): entry is { feature: GeoFeature; point: StormTrackPoint } => Boolean(entry.point))
        .sort((a, b) => a.point.tau - b.point.tau);

      if (!points.length) continue;

      const currentEntry =
        points.find((entry) => entry.point.tau === 0) ||
        points.reduce((best, entry) => entry.point.tau < best.point.tau ? entry : best);

      const current = currentEntry.point;
      const p = currentEntry.feature.properties || {};

      const basin =
        stringValue(p.basin) ||
        stringValue(p.idp_source)?.slice(0, 2) ||
        "NHC";

      const windKnots = current.windKnots;
      const pressure = current.pressure;
      const category = current.category;

      const updatedAt =
        stringValue(p.advdate) ||
        stringValue(p.advisorydate) ||
        stringValue(p.advisory_date) ||
        new Date().toISOString();

      const stormType =
        stringValue(p.stormtype) ||
        stringValue(p.storm_type) ||
        stringValue(p.tc_type) ||
        "TROPICAL CYCLONE";

      const movementDirection =
        numberValue(p.stormdir) ??
        numberValue(p.direction) ??
        numberValue(p.motion_dir);

      const movementSpeedKnots =
        numberValue(p.stormspeed) ??
        numberValue(p.speed) ??
        numberValue(p.motion_speed);

      const track = points
        .map((entry) => entry.point)
        .filter((point) => point.tau >= 0)
        .slice(0, 12);

      storms.push({
        id: group.id,
        name: group.name,
        basin,
        latitude: current.latitude,
        longitude: current.longitude,
        windKnots,
        pressure,
        category,
        stormType,
        advisory: stringValue(p.advisnum) || stringValue(p.advisory),
        updatedAt,
        source: "NOAA NHC",
        movementDirection,
        movementSpeedKnots,
        track,
        layerId: group.layerId,
      });
    }

    return NextResponse.json(
      {
        storms,
        updatedAt: new Date().toISOString(),
        source: "NOAA NHC GIS",
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        storms: [],
        updatedAt: new Date().toISOString(),
        source: "NOAA NHC GIS",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=180, stale-while-revalidate=900",
        },
      },
    );
  }
}
