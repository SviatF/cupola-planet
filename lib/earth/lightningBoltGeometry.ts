/**
 * Deterministic cinematic discharge silhouette, in a camera-facing 2D plane.
 * These triangles depict ILLUSTRATIVE lightning inside an observed/modelled
 * thunderstorm region; they are not geolocated individual strike paths.
 *
 * A continuous tapered channel with staggered side branches replaces the
 * previous three circular sprites that looked like blue UI buttons.
 */
export function buildLightningBoltTriangles(seed: number, thickness = 1): Float32Array {
  const vertices: number[] = [];
  const random = (n: number) => {
    const x = Math.sin((seed + 1) * 127.1 + n * 311.7) * 43758.5453123;
    return x - Math.floor(x);
  };

  const ribbon = (
    ax: number, ay: number, bx: number, by: number,
    widthA: number, widthB: number,
  ) => {
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    if (length < 0.000001) return;
    const px = -dy / length;
    const py = dx / length;
    const xa = ax + px * widthA * thickness;
    const ya = ay + py * widthA * thickness;
    const xb = ax - px * widthA * thickness;
    const yb = ay - py * widthA * thickness;
    const xc = bx + px * widthB * thickness;
    const yc = by + py * widthB * thickness;
    const xd = bx - px * widthB * thickness;
    const yd = by - py * widthB * thickness;
    vertices.push(xa, ya, 0, xb, yb, 0, xc, yc, 0,
                  xb, yb, 0, xd, yd, 0, xc, yc, 0);
  };

  const path: Array<{x:number;y:number}> = [];
  const startX = (random(3) - 0.5) * 0.043;
  const lean = (random(4) - 0.5) * 0.060;
  const trunkSteps = 12;
  for (let i = 0; i <= trunkSteps; i++) {
    const progress = i / trunkSteps;
    const jag = i === 0 || i === trunkSteps ? 0 : (random(15 + i) - 0.5) * 0.050;
    path.push({ x: startX + lean * progress + jag, y: 0.128 - progress * 0.238 });
  }
  for (let i = 0; i < trunkSteps; i++) {
    const t = i / trunkSteps;
    ribbon(path[i].x, path[i].y, path[i+1].x, path[i+1].y,
      0.00255 * (1 - t * 0.57), 0.00255 * (1 - (i+1)/trunkSteps * 0.65));
  }

  // Branch channels split from the *actual* main-channel vertices. They
  // terminate at different heights and taper to zero, never form blue discs.
  for (let branch = 0; branch < 4; branch++) {
    const originIndex = 2 + branch * 2;
    const origin = path[originIndex];
    const side = branch % 2 ? 1 : -1;
    const branchLength = 0.046 + 0.050 * random(55 + branch);
    const angle = 0.47 + 0.53 * random(70 + branch);
    const steps = 4 + (branch % 2);
    let prev = origin;
    for (let j = 1; j <= steps; j++) {
      const t = j / steps;
      const next = {
        x: origin.x + side * branchLength * angle * t +
          (j === steps ? 0 : (random(80 + branch * 10 + j) - 0.5) * 0.019),
        y: origin.y - branchLength * (1 - angle * 0.27) * t,
      };
      ribbon(prev.x, prev.y, next.x, next.y,
        0.00125 * (1 - (j-1)/steps), 0.00125 * (1 - t) + 0.00008);
      prev = next;
    }
  }
  return new Float32Array(vertices);
}

/** All bolt channels must remain geometry-only; cloud glow has a separate shader. */
export function inspectLightningBolt(vertices: Float32Array) {
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < vertices.length; i += 3) {
    minX = Math.min(minX, vertices[i]);
    maxX = Math.max(maxX, vertices[i]);
    minY = Math.min(minY, vertices[i+1]);
    maxY = Math.max(maxY, vertices[i+1]);
  }
  return { triangles: vertices.length / 9, minX, maxX, minY, maxY };
}
