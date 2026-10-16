/**
 * Source-truth cloud health for the public CUPOLA controls.
 * "LIVE" describes ONLY a recent verified L2 observation, not 100%
 * worldwide coverage or a video stream. Visual IR and GFS are not L2.
 */
export type CloudHealth = {
  state: "LIVE" | "DELAYED" | "OFFLINE" | "CHECKING";
  label: string;
  description: string;
  observedAt: string | null;
  ageMinutes: number | null;
};

export function cloudHealth(input: {
  enabled: boolean;
  engine: string;
  status?: "observed" | "visual" | "fallback" | null;
  observationTime?: string | null;
  coverage?: number;
}, now: number): CloudHealth {
  const fallback = (state: CloudHealth["state"], label: string, description: string): CloudHealth =>
    ({ state, label, description, observedAt: null, ageMinutes: null });
  if (!input.enabled) return fallback("OFFLINE", "OFF", "Cloud layer disabled");
  if (input.engine !== "v3")
    return fallback("OFFLINE", "STANDARD · NOT LIVE", "Static/standard visual; not verified live L2");
  if (!input.status) return fallback("CHECKING", "CHECKING SOURCES", "Acquiring current satellite metadata");
  const verified = input.status === "observed" && (input.coverage ?? 0) >= 0.05;
  const visual = input.status === "visual";
  const sourceMs = Date.parse(input.observationTime ?? "");
  const age = Number.isFinite(sourceMs) ? Math.max(0, Math.floor((now - sourceMs) / 60000)) : null;
  const observedAt = Number.isFinite(sourceMs) && sourceMs <= now + 300_000
    ? new Date(sourceMs).toISOString() : null;
  if (!observedAt || age === null) {
    return fallback("OFFLINE", "OFFLINE · SOURCE UNVERIFIED",
      "No authenticated current observation timestamp");
  }
  if (verified && age <= 30)
    return { state:"LIVE", label:`LIVE · ${age}m OBS`,
      description:"Verified NOAA/JMA L2 (regional footprint, not global live video)",
      observedAt, ageMinutes:age };
  if (verified && age <= 90)
    return { state:"DELAYED", label:`DELAYED · ${age}m`,
      description:"Verified L2 observation is older than 30 minutes", observedAt, ageMinutes:age };
  if (visual && age <= 90)
    return { state:"DELAYED", label:`DELAYED · VISUAL ${age}m`,
      description:"Recent satellite visual backup; zero verified current L2",
      observedAt, ageMinutes:age };
  return { state:"OFFLINE", label:"OFFLINE · STALE DATA",
    description:"Current verified satellite cloud observations unavailable",
    observedAt, ageMinutes:age };
}
