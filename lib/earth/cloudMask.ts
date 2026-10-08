// Satellite IR false-colour product -> neutral cloud-density texture.
// RGBA PNG only; no native Node modules, safe for Cloudflare Workers.
// Alpha 0 means outside satellite footprint; alpha 8 means observed clear sky.
// Higher alpha means detected cloud. RGB is white for cinematic lighting.

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const v of bytes) {
    crc ^= v;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(name: string, data: Uint8Array) {
  const out = new Uint8Array(data.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = name.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(out.length - 4, crc32(out.subarray(4, out.length - 4)));
  return out;
}

async function inflate(packed: Uint8Array) {
  const stream = new Blob([Uint8Array.from(packed)]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function deflate(bytes: Uint8Array) {
  const stream = new Blob([Uint8Array.from(bytes)]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function buildCloudMaskFromInfraredPng(buffer: ArrayBuffer): Promise<ArrayBuffer | null> {
  const png = new Uint8Array(buffer);
  if (png.length < 57 || ![137,80,78,71,13,10,26,10].every((v, i) => png[i] === v)) return null;
  const view = new DataView(buffer);
  let width = 0, height = 0, bitDepth = 0, colorType = -1, interlace = -1;
  let offset = 8, ended = false, total = 0;
  const parts: Uint8Array[] = [];
  while (offset + 12 <= png.length) {
    const length = view.getUint32(offset);
    const start = offset + 8;
    if (length > png.length - start - 4) return null;
    if (crc32(png.subarray(offset + 4, start + length)) !== view.getUint32(start + length)) return null;
    const name = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    if (name === "IHDR") {
      if (length !== 13 || width) return null;
      width = view.getUint32(start); height = view.getUint32(start + 4);
      bitDepth = png[start + 8]; colorType = png[start + 9]; interlace = png[start + 12];
    }
    if (name === "IDAT") {
      parts.push(png.subarray(start, start + length)); total += length;
    }
    offset = start + length + 4;
    if (name === "IEND") { ended = true; break; }
  }
  if (!ended || offset !== png.length || width < 256 || height < 128 ||
      width * height > 4194304 || bitDepth !== 8 || colorType !== 6 || interlace !== 0 || !parts.length) return null;
  const input = new Uint8Array(total);
  let at = 0;
  for (const part of parts) { input.set(part, at); at += part.length; }
  const raw = await inflate(input);
  const stride = width * 4;
  if (raw.length !== height * (stride + 1)) return null;
  const mask = new Uint8Array(height * (stride + 1));
  let prev = new Uint8Array(stride);
  let coverage = 0, clouds = 0;
  const smooth = (min: number, max: number, v: number) => {
    const t = Math.max(0, Math.min(1, (v - min) / (max - min)));
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = raw[start];
    if (filter > 4) return null;
    const row = new Uint8Array(stride);
    mask[start] = 0; // PNG filter: none
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? row[x - 4] : 0;
      const up = prev[x], upperLeft = x >= 4 ? prev[x - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upperLeft;
        const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - upperLeft);
        predictor = a <= b && a <= c ? left : b <= c ? up : upperLeft;
      }
      row[x] = (raw[start + 1 + x] + predictor) & 255;
    }
    for (let x = 0; x < stride; x += 4) {
      const a = row[x + 3];
      const o = start + 1 + x;
      if (a <= 8) { mask[o] = mask[o + 1] = mask[o + 2] = mask[o + 3] = 0; continue; }
      coverage++;
      const r = row[x], g = row[x + 1], b = row[x + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      // Conservative colour/brightness proxy. IR palettes are not calibrated
      // cloud probability maps, so we intentionally avoid claiming accuracy.
      const brightness = smooth(130, 230, lum) * 0.77;
      const colouredTop = smooth(38, 110, chroma) * smooth(65, 175, lum);
      const score = Math.max(brightness, colouredTop);
      const opacity = Math.round(8 + Math.pow(score, 1.2) * 237);
      if (opacity > 26) clouds++;
      mask[o] = mask[o + 1] = mask[o + 2] = 255;
      mask[o + 3] = opacity;
    }
    prev = row;
  }
  // Feather the satellite footprint in image-space. Each source is rendered
  // in the same world canvas, but its observable disc has hard no-data edges.
  // A capped city-block distance transform avoids rectangle/vertical seams.
  const pixelCount = width * height;
  const radius = 28;
  const distance = new Uint8Array(pixelCount);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1) + 1;
    for (let x = 0; x < width; x++) distance[y * width + x] = mask[row + x * 4 + 3] > 0 ? radius : 0;
  }
  for (let y = 0; y < height; y++) {
    const base = y * width;
    for (let x = 1; x < width; x++) distance[base + x] = Math.min(distance[base + x], distance[base + x - 1] + 1);
    for (let x = width - 2; x >= 0; x--) distance[base + x] = Math.min(distance[base + x], distance[base + x + 1] + 1);
  }
  for (let y = 1; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      distance[i] = Math.min(distance[i], distance[i - width] + 1);
    }
  }
  for (let y = height - 2; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      distance[i] = Math.min(distance[i], distance[i + width] + 1);
    }
  }
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1) + 1;
    for (let x = 0; x < width; x++) {
      const i = y * width + x, o = row + x * 4 + 3;
      // Zero-alpha pixels stay zero; interior density is not changed.
      const t = Math.max(0, Math.min(1, (distance[i] - 1) / radius));
      mask[o] = Math.round(mask[o] * t * t * (3 - 2 * t));
    }
  }
  // A nearly empty observed footprint is not a usable cloud mask.
  if (coverage < width * height * 0.015 || clouds < 500) return null;
  const compressed = await deflate(mask);
  const ihdr = new Uint8Array(13);
  const hv = new DataView(ihdr.buffer);
  hv.setUint32(0, width); hv.setUint32(4, height);
  ihdr[8] = 8; ihdr[9] = 6;
  const blocks = [png.subarray(0, 8), chunk("IHDR", ihdr), chunk("IDAT", compressed), chunk("IEND", new Uint8Array())];
  const output = new Uint8Array(blocks.reduce((n, block) => n + block.length, 0));
  let cursor = 0;
  for (const block of blocks) { output.set(block, cursor); cursor += block.length; }
  return output.buffer;
}
