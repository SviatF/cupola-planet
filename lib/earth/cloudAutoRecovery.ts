/**
 * Client-side guard for resuming Scientific Cloud V3 after an emergency
 * STANDARD visual fallback. Only an unexpired, source-attributed NOAA/JMA
 * Level-2 manifest is eligible. A stale archive or GFS model isn't enough.
 * Actual immutable PNG validity is separately verified by the V3 API.
 */
export function isFreshCloudV3RecoveryManifest(value: unknown, now: number): boolean {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  if (m.schema !== "cupola-scientific-cloud-v3/v1" ||
      typeof m.version !== "string" || !/^\d{14}$/.test(m.version) ||
      m.width !== 2048 || m.height !== 1024 ||
      typeof m.observed_coverage_fraction !== "number" ||
      m.observed_coverage_fraction < 0.05 ||
      m.observed_coverage_fraction > 1 ||
      !Array.isArray(m.sources) || m.sources.length === 0) return false;

  const generated = Date.parse(String(m.generated_at));
  const expires = Date.parse(String(m.expires_at));
  if (!Number.isFinite(generated) || !Number.isFinite(expires) ||
      generated > now + 5 * 60_000 || expires <= now ||
      expires > generated + 95 * 60_000) return false;
  return m.sources.every((source: unknown) => {
    if (!source || typeof source !== "object") return false;
    const entry = source as Record<string, unknown>;
    if (!["goes-acmf", "himawari9-cmsk"].includes(String(entry.source))) return false;
    const observed = Date.parse(String(entry.observation_end));
    return Number.isFinite(observed) &&
      observed <= now + 5 * 60_000 && now - observed <= 90 * 60_000;
  });
}
