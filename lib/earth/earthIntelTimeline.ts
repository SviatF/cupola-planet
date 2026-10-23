/**
 * CUPOLA Earth Intelligence: timestamped EVENT samples only.
 * Never return forecasts with missing observation timestamps as observed history.
 * A 24-hour event window is NOT a 24-hour archive of clouds or Earth textures.
 */
export function selectHistoricalEvents<T extends { occurredAt: string | null }>(
  events: readonly T[], now: number, offsetHours: number,
): T[] {
  if (!Number.isFinite(now) || !Number.isFinite(offsetHours)) return [];
  const hours = Math.max(0, Math.min(24, offsetHours));
  const cutoff = now - hours * 3_600_000;
  const beginning = now - 24 * 3_600_000;
  return events.filter((event) => {
    if (!event.occurredAt) return false;
    const at = Date.parse(event.occurredAt);
    return Number.isFinite(at) && at >= beginning && at <= cutoff;
  }).sort((a, b) => Date.parse(b.occurredAt!) - Date.parse(a.occurredAt!));
}
