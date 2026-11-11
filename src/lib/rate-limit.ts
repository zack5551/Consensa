/**
 * A small fixed-window rate limiter, kept in this server instance's memory. It is the first line only: the
 * database is the real guard (one change per call every 2 seconds), and this stops one person firing a burst of
 * writes across many questions before they reach it.
 */
export type RateLimiter = (key: string, now?: number) => boolean;

export function rateLimiter({ limit, windowMs, maxKeys = 10_000 }: { limit: number; windowMs: number; maxKeys?: number }): RateLimiter {
  const hits = new Map<string, { start: number; count: number }>();
  return (key, now = Date.now()) => {
    const entry = hits.get(key);
    if (!entry || now - entry.start >= windowMs) {
      // Keep memory bounded: drop the oldest key when full (Map keeps insertion order).
      if (!entry && hits.size >= maxKeys) {
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) hits.delete(oldest);
      }
      hits.set(key, { start: now, count: 1 });
      return true;
    }
    if (entry.count >= limit) return false;
    entry.count += 1;
    return true;
  };
}
