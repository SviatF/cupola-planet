/** Public NOAA GOES GLM Level-2: one record = one optical lightning FLASH,
 * never one ground-strike position. No paid feed, simulated event or
 * interpolation. All times belong to original GLM scan data.
 */
export type GLMFlash = {
  id: string;
  lat: number;
  lon: number;
  observed_at: string;
  satellite: "GOES-18" | "GOES-19";
};

export type GLMFlashFeed = {
  schema: "cupola-goes-glm-flashes/v1";
  generated_at: string;
  expires_at: string;
  latest_observation_at: string;
  observation_kind: "satellite-optical-flash-centroid-not-ground-strike";
  source: string;
  sources: Array<{
    satellite: "GOES-18" | "GOES-19";
    product: "GLM-L2-LCFA";
    last_scan_end: string;
    granules_validated: number;
  }>;
  flashes: GLMFlash[];
  count_sampled: number;
  count_available_in_selected_files: number;
};

export const GLM_MAX_FEED_AGE_MS = 15 * 60_000;
export const GLM_MAX_FLASH_AGE_MS = 12 * 60_000;
const GLM_ID = /^(18|19):\d{13}:\d{1,12}$/;

export function validGLMFlash(event: GLMFlash, now = Date.now()): boolean {
  const ms = Date.parse(event?.observed_at || "");
  return !!event &&
    typeof event.id === "string" && GLM_ID.test(event.id) &&
    (event.satellite === "GOES-18" || event.satellite === "GOES-19") &&
    event.id.startsWith(event.satellite.slice(-2) + ":") &&
    Number.isFinite(event.lat) && event.lat >= -90 && event.lat <= 90 &&
    Number.isFinite(event.lon) && event.lon >= -180 && event.lon <= 180 &&
    Number.isFinite(ms) && ms > now - GLM_MAX_FEED_AGE_MS && ms < now + 60_000;
}

export function parseGLMFeed(json: unknown, now = Date.now()): GLMFlashFeed | null {
  if (!json || typeof json !== "object") return null;
  const feed = json as GLMFlashFeed;
  if (feed.schema !== "cupola-goes-glm-flashes/v1" ||
      feed.observation_kind !== "satellite-optical-flash-centroid-not-ground-strike" ||
      feed.source !== "NOAA GOES GLM-L2-LCFA, public anonymous S3" ||
      !Array.isArray(feed.sources) || !feed.sources.length || feed.sources.length > 2 ||
      !Array.isArray(feed.flashes) || feed.flashes.length > 1600 ||
      !Number.isInteger(feed.count_sampled) || feed.count_sampled !== feed.flashes.length ||
      !Number.isInteger(feed.count_available_in_selected_files) ||
      feed.count_available_in_selected_files < feed.flashes.length) return null;
  const generated = Date.parse(feed.generated_at);
  const expiry = Date.parse(feed.expires_at);
  const observed = Date.parse(feed.latest_observation_at);
  if (![generated, expiry, observed].every(Number.isFinite) ||
      generated < now - GLM_MAX_FEED_AGE_MS || generated > now + 60_000 ||
      expiry <= now || expiry > generated + 11 * 60_000 ||
      observed < now - GLM_MAX_FEED_AGE_MS || observed > now + 60_000 ||
      observed > generated + 60_000) return null;
  const satellites = new Set<string>();
  for (const source of feed.sources) {
    const scanTime = Date.parse(source.last_scan_end);
    if (source.product !== "GLM-L2-LCFA" ||
        (source.satellite !== "GOES-18" && source.satellite !== "GOES-19") ||
        satellites.has(source.satellite) ||
        !Number.isInteger(source.granules_validated) ||
        source.granules_validated < 1 || source.granules_validated > 60 ||
        !Number.isFinite(scanTime) ||
        scanTime < now - GLM_MAX_FEED_AGE_MS ||
        scanTime > generated + 60_000) return null;
    satellites.add(source.satellite);
  }
  if (!feed.flashes.every(event => validGLMFlash(event, now) &&
        satellites.has(event.satellite))) return null;
  const ids = new Set(feed.flashes.map(event => event.id));
  return ids.size === feed.flashes.length ? feed : null;
}

/** At-most-once animation for unique NOAA IDs while this tab is open.
 * Late observations are never "replayed live" over an indefinite window.
 * Pick a small new subset for GPU load; mark ALL seen to prevent repeats.
 */
export function selectUnseenGLMFlashes(
  feed: GLMFlashFeed,
  seen: Set<string>,
  now = Date.now(),
  maxVisible = 80,
): GLMFlash[] {
  const eligible = feed.flashes.filter(event =>
    validGLMFlash(event, now) && now - Date.parse(event.observed_at) <= 7 * 60_000 &&
    !seen.has(event.id));
  for (const flash of feed.flashes) seen.add(flash.id);
  // Avoid unbounded long-lived memory; old IDs fall off after 12 minutes.
  if (seen.size > 10_000) {
    seen.clear();
    for (const flash of feed.flashes) seen.add(flash.id);
  }
  return eligible.sort((a, b) =>
    Date.parse(b.observed_at) - Date.parse(a.observed_at)).slice(0, maxVisible);
}
