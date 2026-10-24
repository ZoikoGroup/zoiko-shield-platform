/**
 * Row count for a list endpoint over a table that only grows (events,
 * deliveries, history): the caller's `?limit=` when it is a positive integer,
 * capped at `max`, otherwise `fallback`. Lists using it must order newest
 * first, so a capped page is the most recent rows rather than an arbitrary
 * subset.
 */
export function boundedTake(limit: unknown, fallback = 100, max = 500): number {
  const requested = Number(limit);
  return Number.isInteger(requested) && requested > 0
    ? Math.min(requested, max)
    : fallback;
}
