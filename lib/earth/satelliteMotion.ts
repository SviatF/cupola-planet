/**
 * GPU/CPU-compatible angular interpolation for satellite position snapshots.
 * This moves along the radius-normalized great-circle arc, never through the
 * Earth's interior as a direct Cartesian chord does.
 *
 * It DOES NOT turn the server's two-body propagated OMM coordinates into SGP4
 * positions; accuracy is bounded by the original orbital element propagator.
 */
export type OrbitalVec3 = readonly [number, number, number];

export const SATELLITE_MOTION_WINDOW_MS = 180_000;
export const SATELLITE_MOTION_REFERENCE_BUCKET_MS = 3_600_000;

export function satelliteMotionFactor(
  targetTimestamp: string | null | undefined,
  nowMs: number,
  windowMs = SATELLITE_MOTION_WINDOW_MS,
): number {
  const target = typeof targetTimestamp === "string" && targetTimestamp.length
    ? Date.parse(targetTimestamp) : NaN;
  if (!Number.isFinite(target) || !Number.isFinite(nowMs) ||
      !Number.isFinite(windowMs) || windowMs <= 0) return 0;
  return Math.max(0, Math.min(1, (nowMs - (target - windowMs)) / windowMs));
}

export function satelliteMotionClockOffset(
  targetTimestamp: string | null | undefined,
  referenceMs: number,
): number {
  const target = targetTimestamp ? Date.parse(targetTimestamp) : NaN;
  if (!Number.isFinite(target) || !Number.isFinite(referenceMs)) return 0;
  return (target - SATELLITE_MOTION_WINDOW_MS - referenceMs) / 1000;
}

export function satelliteOrbitArcPoint(
  from: OrbitalVec3,
  to: OrbitalVec3,
  center: OrbitalVec3,
  progress: number,
): [number, number, number] {
  const t = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const a = [from[0] - center[0], from[1] - center[1], from[2] - center[2]];
  const b = [to[0] - center[0], to[1] - center[1], to[2] - center[2]];
  const radiusA = Math.hypot(a[0], a[1], a[2]);
  const radiusB = Math.hypot(b[0], b[1], b[2]);
  if (radiusA <= 1e-8 || radiusB <= 1e-8) return [...from];
  const x = (1-t)*a[0]/radiusA + t*b[0]/radiusB;
  const y = (1-t)*a[1]/radiusA + t*b[1]/radiusB;
  const z = (1-t)*a[2]/radiusA + t*b[2]/radiusB;
  const length = Math.hypot(x,y,z);
  // A 3-minute real orbital arc is nowhere near antipodal; guard invalid
  // telemetry anyway, and never project it underneath the globe.
  if (length <= 1e-8) return t < 0.5 ? [...from] : [...to];
  const radius = radiusA + (radiusB - radiusA)*t;
  return [
    center[0] + x/length*radius,
    center[1] + y/length*radius,
    center[2] + z/length*radius,
  ];
}
