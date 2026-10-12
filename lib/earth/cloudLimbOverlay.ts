/**
 * Scientific V3 source-limb visual supplement (display-only, not cloud-mask).
 *
 * The real exported 2048x1024 atlas has NOAA GMGSI IR on one side of the
 * geostationary limb and classified-clear Level-2 on the other. The
 * classified-clear DARK region often CONTINUES for ~20-60 atlas pixels even
 * after L2 G reaches 255: fading purely by G left an unchanged black stripe.
 * Instead use actual same-location satellite IR along a fixed, finite limb-
 * distance crossover, NEVER by spatial extension of a neighbor cloud. It NEVER changes classified Level-2 bytes, confidence,
 * source identity, the scientific PNG, coverage counters, or the final
 * exported source/provenance atlas. The GPU receives a separate R=IR,
 * G=visual-blend-strength texture and treats it explicitly as IR VISUAL,
 * NOT VERIFIED L2.
 *
 * Only currently sourced GMGSI pixels may contribute. No model, WMS,
 * clear or no-data pixel is ever invented; no spatial copying of IR pixels.
 * X neighbors are periodic longitude; north/south edges are not periodic.
 */
export type SatelliteLimbOverlayStats = {
  borderSeeds: number;
  observedIrLimbPixels: number;
  unsupportedOrClearPixels: number;
  alteredSciencePixels: 0;
  radiusPixels: number;
  farSideIrPixels: number;
  maxObservedDistance: number;
};

const eased = (v: number) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};
const supplemental = (b: number) => b === 224 || b === 232 || b === 248;
const validInfrared = (data: Uint8ClampedArray, p: number) => {
  const o = p * 4;
  return data[o + 1] === 135 && data[o + 2] === 232 && data[o + 3] === 255;
};

export function buildSatelliteLimbOverlay(
  science: ImageData,
  composite: ImageData,
  infrared: ImageData,
  radius = 64,
): { image: ImageData; stats: SatelliteLimbOverlayStats } {
  const w = science.width, h = science.height;
  if (w < 8 || h < 4 ||
      w !== composite.width || h !== composite.height ||
      w !== infrared.width || h !== infrared.height) {
    throw new Error("Satellite limb overlay requires matching georeferenced atlas dimensions");
  }
  const limit = Math.max(2, Math.min(72, Math.floor(radius)));
  const n = w * h, s = science.data, c = composite.data, ir = infrared.data;
  const out = new ImageData(new Uint8ClampedArray(n * 4), w, h);
  const bytes = out.data;
  const distances = new Uint8Array(n);
  const queue = new Int32Array(n);
  const scienceAt = (p: number) => s[p * 4 + 1] > 0 && s[p * 4 + 2] < 200;
  // Continue into the native disk for a finite source handoff, EVEN after
  // classification confidence reaches 255. The original L2 mask is kept
  // byte-perfect; this is a separately attributed VISUAL-only IR observation.
  const candidate = (p: number) => scienceAt(p) && validInfrared(ir, p);
  const visit = (p: number, fn: (q: number) => void) => {
    const x = p % w, y = (p - x) / w;
    fn(p + (x === 0 ? w - 1 : -1));
    fn(p + (x === w - 1 ? -(w - 1) : 1));
    if (y > 0) fn(p - w);
    if (y + 1 < h) fn(p + w);
  };

  let head = 0, tail = 0;
  // Seed on LOW-CONFIDENCE native L2 next to separately-attributed
  // actual satellite visualization. An adjacent GFS-only (B=255) / no-data
  // footprint is NOT evidence of clouds, so it must never seed a bridge.
  for (let p = 0; p < n; p++) {
    // A true native limb begins with LOW view-angle quality. Do not mistake
    // arbitrary internal source boundaries for a new geostationary disk edge.
    if (!candidate(p) || s[p * 4 + 1] > 90) continue;
    let bordersSatellite = false;
    visit(p, q => {
      const o = q * 4;
      if (!scienceAt(q) && c[o + 1] > 0 && supplemental(c[o + 2]))
        bordersSatellite = true;
    });
    if (!bordersSatellite) continue;
    distances[p] = 1;
    queue[tail++] = p;
  }
  const borderSeeds = tail;
  // A narrow limb-distance mask is used ONLY to select pixels. The
  // visual signal itself is always the valid real IR pixel at that exact
  // longitude/latitude, never the nearest cloud from the other side.
  while (head < tail) {
    const p = queue[head++], d = distances[p];
    if (d >= limit) continue;
    visit(p, q => {
      if (distances[q] || !candidate(q)) return;
      distances[q] = d + 1;
      queue[tail++] = q;
    });
  }

  let observed = 0, unsupported = 0, farSideIrPixels = 0, maxObservedDistance = 0;
  for (let i = 0; i < tail; i++) {
    const p = queue[i], o = p * 4, d = distances[p];
    // The original classified cloud is authoritative where stronger.
    // A zero/weak GMGSI pixel cannot turn a clear L2 class cloudy.
    if (ir[o] < 12 || ir[o] <= s[o] + 12) { unsupported++; continue; }
    // R is the actual IR signal AT THIS PIXEL, not interpolated from the
    // neighboring scene. The coverage crossover tapers smoothly to ZERO at
    // the end of its finite strip: no fake 84px grey stretched from L2.
    // L2 confidence MUST NOT be a second taper: actual high-confidence
    // L2-clear runs tens of pixels into the seam and caused the old black bar.
    const edge = 1 - eased((d - 1) / limit);
    const strength = Math.min(0.96, Math.max(0, edge * 0.96));
    if (strength < 1 / 255) continue;
    bytes[o] = ir[o];
    bytes[o + 1] = Math.round(strength * 255);
    bytes[o + 2] = 232; // independently attributed real GMGSI visual IR
    bytes[o + 3] = 255;
    observed++;
    if (s[o + 1] >= 246) farSideIrPixels++;
    maxObservedDistance = Math.max(maxObservedDistance, d);
  }
  return { image: out, stats: {
    borderSeeds,
    observedIrLimbPixels: observed,
    unsupportedOrClearPixels: unsupported,
    alteredSciencePixels: 0,
    radiusPixels: limit,
    farSideIrPixels,
    maxObservedDistance,
  } };
}
