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

    const stormsByKey = new Map<string, Record<string, unknown>>();

    for (const result of responses) {
      const currentFeatures = result.features.filter((feature) => {
        const tau = numberValue(feature.properties?.tau);
        return tau == null || tau === 0;
      });

      for (const feature of currentFeatures) {
        if (feature.geometry?.type !== "Point" || !Array.isArray(feature.geometry.coordinates)) continue;

        const lon = numberValue(feature.geometry.coordinates[0]);
        const lat = numberValue(feature.geometry.coordinates[1]);
        if (lat == null || lon == null) continue;

        const p = feature.properties || {};
        const name =
          stringValue(p.stormname) ||
          stringValue(p.storm_name) ||
          stringValue(p.name) ||
          "ACTIVE CYCLONE";

        const basin =
          stringValue(p.basin) ||
          stringValue(p.idp_source)?.slice(0, 2) ||
          "NHC";

        const id =
          stringValue(p.stormid) ||
          stringValue(p.storm_id) ||
          stringValue(p.idp_source) ||
          name + ":" + lat.toFixed(2) + ":" + lon.toFixed(2);

        const windKnots =
          numberValue(p.maxwind) ??
          numberValue(p.max_wind) ??
          numberValue(p.wind);

        const pressure =
          numberValue(p.mslp) ??
          numberValue(p.pressure);

        const category =
          numberValue(p.ssnum) ??
          numberValue(p.category);

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

        stormsByKey.set(id, {
          id,
          name,
          basin,
          latitude: lat,
          longitude: lon,
          windKnots,
          pressure,
          category,
          stormType,
          advisory: stringValue(p.advisnum) || stringValue(p.advisory),
          updatedAt,
          source: "NOAA NHC",
          layerId: result.layerId,
        });
      }
    }

    const storms = Array.from(stormsByKey.values());

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
