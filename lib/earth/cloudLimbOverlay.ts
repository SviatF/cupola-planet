/**
 * Scientific V3 source-limb visual supplement (display-only, not cloud-mask).
 *
 * The real exported 2048x1024 atlas has NOAA GMGSI IR on one side of the
 * geostationary limb and classified-clear Level-2 with *very low view
 * confidence* on the other. There are no missing G=0 columns there.
 * Smoothing only the no-L2 side cannot close this seam; it also risks drawing
 * 84px grey curtains. Use the ACTUAL same-coordinate NOAA IR measurement,
 * independently of source ownership, as a tiny low-confidence L2-limb
 * visual overlay. It NEVER changes classified Level-2 bytes, confidence,
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
  radius = 16,
): { image: ImageData; stats: SatelliteLimbOverlayStats } {
  const w = science.width, h = science.height;
  if (w < 8 || h < 4 ||
      w !== composite.width || h !== composite.height ||
      w !== infrared.width || h !== infrared.height) {
    throw new Error("Satellite limb overlay requires matching georeferenced atlas dimensions");
  }
  const limit = Math.max(2, Math.min(20, Math.floor(radius)));
  const n = w * h, s = science.data, c = composite.data, ir = infrared.data;
  const out = new ImageData(new Uint8ClampedArray(n * 4), w, h);
  const bytes = out.data;
  const distances = new Uint8Array(n);
  const queue = new Int32Array(n);
  const scienceAt = (p: number) => s[p * 4 + 1] > 0 && s[p * 4 + 2] < 200;
  const candidate = (p: number) =>
    scienceAt(p) && s[p * 4 + 1] < 246 && validInfrared(ir, p);
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
    if (!candidate(p)) continue;
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

  let observed = 0, unsupported = 0;
  for (let i = 0; i < tail; i++) {
    const p = queue[i], o = p * 4, d = distances[p];
    // The original classified cloud is authoritative where stronger.
    // A zero/weak GMGSI pixel cannot turn a clear L2 class cloudy.
    if (ir[o] < 12 || ir[o] <= s[o] + 8) { unsupported++; continue; }
    const edge = 1 - eased((d - 1) / limit);
    // GOES/JMA view-angle confidence rises from 1/255 or 26/255 at
    // the limb to 255/255 in the trusted disk interior. Fade to ZERO
    // before high-confidence L2; never hide the full scientific scene.
    const trust = 1 - eased((s[o + 1] - 26) / 220);
    const strength = Math.min(0.78, Math.max(0, edge * trust * 0.78));
    if (strength < 1 / 255) continue;
    bytes[o] = ir[o];
    bytes[o + 1] = Math.round(strength * 255);
    bytes[o + 2] = 232; // independently attributed real GMGSI visual IR
    bytes[o + 3] = 255;
    observed++;
  }
  return { image: out, stats: {
    borderSeeds,
    observedIrLimbPixels: observed,
    unsupportedOrClearPixels: unsupported,
    alteredSciencePixels: 0,
    radiusPixels: limit,
  } };
}
