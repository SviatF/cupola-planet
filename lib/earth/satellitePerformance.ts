/** Local, opt-in on-device diagnostics: never network telemetry. */
export type SatelliteFrameStats = {
  fps: number;
  p95FrameMs: number;
  worstFrameMs: number;
  frames: number;
  sampleSeconds: number;
};

export function satelliteFrameStats(intervalsMs: readonly number[]): SatelliteFrameStats | null {
  const valid = intervalsMs.filter(ms => Number.isFinite(ms) && ms > 0 && ms < 60_000);
  if (valid.length < 2) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  const total = valid.reduce((sum, dt) => sum + dt, 0);
  return {
    fps: Math.round((valid.length * 1000 / total) * 10) / 10,
    p95FrameMs: Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1] * 10) / 10,
    worstFrameMs: Math.round(sorted[sorted.length - 1] * 10) / 10,
    frames: valid.length,
    sampleSeconds: Math.round((total / 1000) * 10) / 10,
  };
}
