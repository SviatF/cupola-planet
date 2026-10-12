/**
 * Display-only pixel-grid edge antialiasing for Meteosat WMS supplemental
 * clouds. NEVER reads native L2 as a blur input; NEVER changes native L2
 * or known-clear L2 cells. Cloud density R is the only writable channel.
 *
 * A categorical WMS Cloud Mask is not a photo. This gentle 2-pixel binomial
 * filter reduces staircase/square artifacts in its rendered contours, but
 * does not invent cloud coverage or increase science/provenance metrics.
 * A valid WMS coverage cell is required at each filter sample.
 */
export function softenSupplementalCloudContours(
  science: ImageData,
  composite: ImageData,
): ImageData {
  const w = composite.width, h = composite.height;
  if (w !== science.width || h !== science.height || w < 5 || h < 5)
    throw new Error("Meteosat contour filter needs matching atlases");

  const n = w * h;
  const base = science.data;
  const input = composite.data;
  const filtered = new ImageData(new Uint8ClampedArray(input), w, h);
  const output = filtered.data;
  const horizontal = new Uint8Array(n);
  const kernel = [1, 4, 6, 4, 1];

  // Supplemental WMS uses B=224 (0-degree) or B=248 (IODC).
  // Native L2 can have R=0 on clear sky: eligibility depends on G, NOT R.
  const supplementalAt = (p: number, source: number) =>
    base[p * 4 + 1] === 0 &&
    input[p * 4 + 1] > 0 &&
    input[p * 4 + 2] === source &&
    (source === 224 || source === 248);

  // Phase one: horizontal contour antialias. Wrap 180/-180 longitude.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, o = p * 4, source = input[o + 2];
    horizontal[p] = input[o];
    if (!supplementalAt(p, source)) continue;
    let total = 0, weight = 0;
    for (let dx = -2; dx <= 2; dx++) {
      const q = y * w + ((x + dx + w) % w);
      if (!supplementalAt(q, source)) continue;
      total += input[q * 4] * kernel[dx + 2];
      weight += kernel[dx + 2];
    }
    horizontal[p] = Math.round(total / weight);
  }

  // Phase two: vertical contour antialias, with no extrapolation over poles,
  // outside WMS valid pixels, or across NOAA/JMA L2 boundaries.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, o = p * 4, source = input[o + 2];
    if (!supplementalAt(p, source)) continue;
    let total = 0, weight = 0;
    for (let dy = -2; dy <= 2; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      const q = yy * w + x;
      if (!supplementalAt(q, source)) continue;
      total += horizontal[q] * kernel[dy + 2];
      weight += kernel[dy + 2];
    }
    output[o] = Math.round(total / weight);
    // Output G/B/A retained byte-for-byte from incoming.
  }

  return filtered;
}
