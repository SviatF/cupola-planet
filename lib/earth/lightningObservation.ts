/**
 * Strict maximum age for a region to be presented as an observed storm.
 * NOAA: 15 min accumulation + publication latency. MTG: 5 min accumulation.
 * Older maps are NOT current lightning: hide rather than recycling the frame.
 */
export const LIGHTNING_FRESHNESS_MINUTES = {
  NOAA: 45,
  MTG: 30,
} as const;

/**
 * WMS timestamps must come from the requested named lightning layer.
 * GetCapabilities commonly contains hundreds of unrelated dates; using the
 * newest timestamp in the document yields empty GetMap results.
 */
export function lightningLayerTime(
  xml: string,
  layerName: string,
  maxAgeMinutes: number,
  nowMs = Date.now(),
): string | null {
  const escaped = layerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const named = new RegExp(
    "<(?:[\\w.-]+:)?Name>\\s*" + escaped + "\\s*</(?:[\\w.-]+:)?Name>",
    "i",
  ).exec(xml);
  if (!named) return null;

  // A leaf Layer closes before the next sibling. Never read timestamps from
  // the next weather/imagery product in the capabilities document.
  const rest = xml.slice(named.index);
  const close = /<\/(?:[\w.-]+:)?Layer\s*>/i.exec(rest);
  const section = close ? rest.slice(0, close.index) : rest.slice(0, 12000);
  const dimensions = Array.from(
    section.matchAll(
      /<(?:[\w.-]+:)?(?:Dimension|Extent)\b[^>]*\bname\s*=\s*["']time["'][^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?(?:Dimension|Extent)\s*>/gi,
    ),
    (match) => match[1],
  );
  const observations: number[] = [];

  for (const dimension of dimensions) {
    for (const entry of dimension.split(",")) {
      const parts = entry.trim().split("/");
      // WMS accepts single timestamp or start/end/period. End is newest.
      const candidate = parts.length >= 2 ? parts[1] : parts[0];
      const ms = Date.parse(candidate || "");
      if (Number.isFinite(ms) && ms <= nowMs + 5 * 60000 && ms >= nowMs - maxAgeMinutes * 60000) {
        observations.push(ms);
      }
    }
  }

  return observations.length ? new Date(Math.max(...observations)).toISOString() : null;
}
