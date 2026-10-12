/**
 * CUPOLA V3 — asymmetric boundary matching for a unified visual atlas.
 *
 * Only modifies pixels which do NOT belong to the authoritative base.
 * Scientific observations (including confirmed clear sky) remain byte-perfect.
 * Meteosat IR / GFS pixels still carry their original G=confidence and B=source
 * channels; edge harmonisation is DISPLAY ONLY, not additional L2 science.
 *
 * At an existing L2->WMS or WMS->GFS border, estimate the local intensity
 * difference, harmonically smooth it ALONG the missing-side boundary,
 * then decay that correction into the newly covered side. This
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
  // Nearest-seed / Voronoi propagation alone causes long radial streaks
  // wherever different clouds touch the L2 footprint. Solve a small
  // *one-sided harmonic extension* of the luminance correction instead:
  // 1. Exact boundary samples (distance=1) stay pinned to real L2 values.
  // 2. Corrections diffuse tangentially across the missing-side corridor.
  // 3. They decay to ZERO at its outer edge, leaving original WMS/GFS pixels.
  // This is a display-only mathematical transition, never new observation
  // data. It cannot invent an unobserved meteorological cloud structure.
  //
  // Jacobi ping-pong avoids traversal-order / directional artefacts, and
  // precomputed nearest-distance seeds limit work to the narrow gap band.
  // No pixel with authoritative G>0 is ever written in this function.
  let current = corrections;
  let next = new Float32Array(n);
  const iterations = Math.min(72, Math.max(24, limit * 3));
  for (let step = 0; step < iterations; step++) {
    for (let i = 0; i < count; i++) {
      const p = queue[i];
      const d = distances[p];
      if (d === 1 || d === limit) {
        next[p] = d === 1 ? corrections[p] : 0;
        continue;
      }
      let sum = 0;
      let samples = 0;
      neighbors(p, q => {
        if (distances[q] >= 1 && distances[q] < limit) {
          sum += current[q];
          samples++;
        }
      });
      // For isolated WMS/GFS islands, do not bridge an unobserved gap.
      next[p] = samples ? sum / samples : 0;
    }
    const swapped = current;
    current = next;
    next = swapped;
  }
  for (let i = 0; i < count; i++) {
    const p = queue[i];
    const d = distances[p];
    const t = Math.max(0, Math.min(1, (d - 1) / (limit - 1)));
    const strength = 1 - t * t * (3 - 2 * t);
    const o = p * 4;
    out[o] = Math.max(0, Math.min(255,
      Math.round(incoming[o] + current[p] * strength)));
    // G/B/A are intentionally unchanged: exact source provenance and
    // confirmed-clear science pixels must remain byte-for-byte identical.
  }
  return result;
}
