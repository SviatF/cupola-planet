/**
 * Converts observed WMS lightning-activity pixels into APPROXIMATE storm zones.
 * Never interpret a WMS density/accumulation pixel as a geolocated individual strike.
 * This module intentionally has no dependency on React, Three or the cloud engine.
 */
export type LightningStormZone = {
  latitude: number;
  longitude: number;
  strength: number;
  source: "NOAA" | "MTG" | "MODEL";
};

export type LightningZoneExtraction = {
  cells: number;
  zones: LightningStormZone[];
};

/** Great-circle angular separation in degrees; handles the dateline correctly. */
export function lightningZoneDistance(a: LightningStormZone, b: LightningStormZone): number {
  const d2r = Math.PI / 180;
  const lat1 = a.latitude * d2r;
  const lat2 = b.latitude * d2r;
  const deltaLat = (b.latitude - a.latitude) * d2r;
  const deltaLon = (b.longitude - a.longitude) * d2r;
  const h = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(Math.max(0, h)))) / d2r;
}

/** Dedupe overlapping NOAA/MTG regions; cap the number of active GPU effects. */
export function selectLightningStormZones(
  zones: LightningStormZone[],
  maxZones = 24,
  minSeparationDegrees = 5,
): LightningStormZone[] {
  const selected: LightningStormZone[] = [];
  for (const candidate of [...zones]
    .filter(zone => Number.isFinite(zone.latitude) && Number.isFinite(zone.longitude) &&
      Number.isFinite(zone.strength) && zone.strength > 0)
    .sort((a, b) => b.strength - a.strength)) {
    if (selected.every(existing => lightningZoneDistance(existing, candidate) >= minSeparationDegrees)) {
      selected.push(candidate);
      if (selected.length >= maxZones) break;
    }
  }
  return selected;
}

/**
 * Use only colored, non-transparent activity pixels, NOT WMS alpha alone.
 * Aggregate within ~2.8-degree geographic cells at 512x256, then retain
 * isolated, strongest observed storm regions. Input is north-up EPSG:4326.
 */
export function extractLightningStormZones(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  source: "NOAA" | "MTG",
  maxZones = 16,
): LightningZoneExtraction {
  const absent: LightningZoneExtraction = { cells: 0, zones: [] };
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 2 || height < 2 || rgba.length < width * height * 4) return absent;

  const binsX = Math.min(128, width);
  const binsY = Math.min(64, height);
  const bins = new Map<number, { weight: number; wx: number; wy: number }>();
  let cells = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = rgba[i + 3] / 255;
      const color = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) / 255;
      // Dark/opaque WMS backgrounds aren't lightning.
      if (alpha < 0.08 || color < 0.075) continue;
      cells++;
      const weight = alpha * color;
      const bx = Math.min(binsX - 1, Math.floor(x * binsX / width));
      const by = Math.min(binsY - 1, Math.floor(y * binsY / height));
      const id = by * binsX + bx;
      const bin = bins.get(id) ?? { weight: 0, wx: 0, wy: 0 };
      bin.weight += weight;
      bin.wx += (x + 0.5) * weight;
      bin.wy += (y + 0.5) * weight;
      bins.set(id, bin);
    }
  }

  // A nearly full opaque/colored image is likely a WMS basemap or error,
  // not a handful of discrete active storm regions.
  if (cells === 0 || cells > width * height * 0.35) return absent;

  const candidates: LightningStormZone[] = [];
  for (const bin of bins.values()) {
    if (bin.weight <= 0) continue;
    const x = bin.wx / bin.weight;
    const y = bin.wy / bin.weight;
    candidates.push({
      latitude: 90 - y * 180 / height,
      longitude: -180 + x * 360 / width,
      // This is a purely VISUAL strength, not strike count or probability.
      strength: Math.min(1, 0.26 + Math.log2(1 + bin.weight) * 0.23),
      source,
    });
  }

  return { cells, zones: selectLightningStormZones(candidates, maxZones, 5.5) };
}

/** Repeatable illustrated flash rhythm, NOT observed strike timing. */
export function stormZoneFlashEnvelope(seconds: number, seed: number): number {
  const period = 5.8 + ((seed * 17) % 5) * 0.75;
  const offset = seed * 1.17;
  const phase = ((seconds + offset) % period + period) % period;
  const main = Math.exp(-phase * 19);
  const echo = Math.exp(-Math.abs(phase - 0.19) * 29) * 0.67;
  return Math.min(1, main + echo);
}
