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
 * Region-aware model fallback: an observation in the Atlantic must NEVER
 * suppress an ECMWF forecast in the western Pacific. Suppress modeled pixels
 * close to verified observed activity, to avoid two flashes in one cloud.
 * This separation does not upgrade models into verified observations.
 */
export function filterModelLightningByObservation<T extends { latitude: number; longitude: number }>(
  points: T[],
  observedZones: LightningStormZone[],
  radiusDegrees = 7,
): T[] {
  return points.filter(point =>
    observedZones.every(observed =>
      lightningZoneDistance({
        latitude: point.latitude, longitude: point.longitude,
        strength: 1, source: "MODEL",
      }, observed) >= radiusDegrees),
  );
}

/**
 * Extract actual connected lightning-activity footprints from a north-up
 * WMS 1.1.1 EPSG:4326 raster (left = 180 W, top = 90 N).
 *
 * Earlier code selected one hotspot for every arbitrary 2.8-degree bin:
 * this can shift a flash away from the real active cloud. This version uses
 * the radiance-weighted centroid of each connected activity footprint.
 *
 * It is deliberately conservative: two adjacent signal pixels are needed
 * before rendering a storm; isolated styling artifacts are discarded.
 * This is VISUAL WMS accumulation, not raw individual strike telemetry.
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

  const count = width * height;
  const signal = new Uint8Array(count);
  let cells = 0;

  for (let pixel = 0; pixel < count; pixel++) {
    const i = pixel * 4;
    const alpha = rgba[i + 3] / 255;
    const radiance = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) / 255;
    if (alpha < 0.08 || radiance < 0.075) continue;
    cells++;
    signal[pixel] = Math.max(1, Math.round(255 * alpha * radiance));
  }

  // Fail closed for entirely blank or largely filled background imagery.
  if (!cells || cells > count * 0.35) return absent;
  const visited = new Uint8Array(count);
  const queue: number[] = [];
  const candidates: LightningStormZone[] = [];

  for (let seed = 0; seed < count; seed++) {
    if (!signal[seed] || visited[seed]) continue;
    visited[seed] = 1;
    queue.length = 0;
    queue.push(seed);
    let sum = 0, wx = 0, wy = 0, componentPixels = 0;
    let head = 0;

    while (head < queue.length) {
      const pixel = queue[head++];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      const weight = signal[pixel] / 255;
      sum += weight;
      wx += (x + 0.5) * weight;
      wy += (y + 0.5) * weight;
      componentPixels++;

      // Connect close activity pixels (a 1-pixel hole is common when WMS is
      // downsampled). Never bridge distant storm cells arbitrarily.
      for (let dy = -2; dy <= 2; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const neighbor = ny * width + nx;
          if (!signal[neighbor] || visited[neighbor]) continue;
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }

    if (componentPixels < 2 || sum <= 0) continue;
    const x = wx / sum;
    const y = wy / sum;
    const latitude = 90 - y * 180 / height;
    const longitude = -180 + x * 360 / width;
    candidates.push({
      latitude,
      longitude,
      // Relative visual strength only. Source WMS palette values are not
      // convertible into physical lightning counts without its SLD legend.
      strength: Math.min(1, 0.24 + Math.log2(1 + sum) * 0.18),
      source,
    });
  }

  return {
    cells,
    // ~2-degree separation preserves neighboring independent convective cells.
    zones: selectLightningStormZones(candidates, maxZones, 2),
  };
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
