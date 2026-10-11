/**
 * CUPOLA V3 — asymmetric boundary matching for a unified visual atlas.
 *
 * Only modifies pixels which do NOT belong to the authoritative base.
 * Scientific observations (including confirmed clear sky) remain byte-perfect.
 * Meteosat IR / GFS pixels still carry their original G=confidence and B=source
 * channels; edge harmonisation is DISPLAY ONLY, not additional L2 science.
 *
 * At an existing L2->WMS or WMS->GFS border, estimate the local intensity
 * difference then decay that correction into the newly covered side. This
 * avoids the artificial dark ribbon caused by fading the WMS mask to black
 * and avoids globally repainting the 65.6% Level-2 scene.
 */
export function bridgeVisualCloudGap(
  authoritative: ImageData,
  composite: ImageData,
  radius = 20,
): ImageData {
  const width = composite.width, height = composite.height;
  if (width !== authoritative.width || height !== authoritative.height ||
      width < 4 || height < 4) {
    throw new Error("Seam bridge requires equal-sized global atlases");
  }
  const limit = Math.max(2, Math.min(48, Math.floor(radius)));
  const n = width * height;
  const source = authoritative.data;
  const incoming = composite.data;
  const result = new ImageData(new Uint8ClampedArray(incoming), width, height);
  const out = result.data;
  // No-data from both sources cannot be turned into imaginary cloud pixels.
  const gap = (p: number) => source[p * 4 + 1] === 0 && incoming[p * 4 + 1] > 0;
  const authoritativeAt = (p: number) => source[p * 4 + 1] > 0;
  const distances = new Uint8Array(n);
  distances.fill(255);
  const corrections = new Float32Array(n);
  const queue = new Int32Array(n);
  let read = 0, count = 0;
  const neighbors = (p: number, fn: (q: number) => void) => {
    const x = p % width, y = (p - x) / width;
    fn(p + (x === 0 ? width - 1 : -1));
    fn(p + (x === width - 1 ? -(width - 1) : 1));
    if (y > 0) fn(p - width);
    if (y + 1 < height) fn(p + width);
  };
  // Seed only the missing side adjacent to an actual valid source pixel.
  // Longitude wraps, but poles do not (equirectangular global map).
  for (let p = 0; p < n; p++) {
    if (!gap(p)) continue;
    let sum = 0, sampleCount = 0;
    neighbors(p, q => {
      if (authoritativeAt(q)) {
        sum += source[q * 4];
        sampleCount++;
      }
    });
    if (!sampleCount) continue;
    distances[p] = 1;
    corrections[p] = sum / sampleCount - incoming[p * 4];
    queue[count++] = p;
  }
  // Expand the correction strictly within the missing side, never through
  // a classified-clear L2 cell or outside valid supplementary coverage.
  while (read < count) {
    const p = queue[read++];
    const dist = distances[p];
    if (dist >= limit) continue;
    neighbors(p, q => {
      if (distances[q] !== 255 || !gap(q)) return;
      distances[q] = dist + 1;
      corrections[q] = corrections[p];
      queue[count++] = q;
    });
  }
  // A small tangential smoothing removes jump-flood/Voronoi boundaries in
  // propagated correction values. Still changes ONLY missing-side R.
  const smoothCorrections = new Float32Array(n);
  for (let i = 0; i < count; i++) {
    const p = queue[i];
    let sum = corrections[p] * 4, weight = 4;
    neighbors(p, q => {
      if (distances[q] <= limit) {
        sum += corrections[q];
        weight++;
      }
    });
    smoothCorrections[p] = sum / weight;
  }
  for (let i = 0; i < count; i++) {
    const p = queue[i], d = distances[p];
    const t = Math.max(0, Math.min(1, (d - 1) / (limit - 1)));
    const strength = 1 - t * t * (3 - 2 * t);
    const o = p * 4;
    out[o] = Math.max(0, Math.min(255,
      Math.round(incoming[o] + smoothCorrections[p] * strength)));
    // G/B/A are intentionally unchanged: provenance and scientific coverage
    // stay truthful, including observed CLEAR and model-based areas.
  }
  return result;
}
