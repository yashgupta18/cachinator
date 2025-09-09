import type { CacheStore, RateLimitStore } from '../types';

type Counter = {
  count: number;
  expiresAt: number; // timestamp ms
};

export class MemoryStore implements RateLimitStore, CacheStore {
  private readonly counters = new Map<string, Counter>();
  private readonly cache = new Map<string, { body: any; statusCode?: number; contentType?: string; expiresAt: number }>();

  async increment(key: string, windowMs: number): Promise<{ totalHits: number; ttlMs: number }> {
    const now = Date.now();
    const record = this.counters.get(key);
    if (!record || record.expiresAt <= now) {
      const expiresAt = now + windowMs;
      this.counters.set(key, { count: 1, expiresAt });
      return { totalHits: 1, ttlMs: expiresAt - now };
    }
    record.count += 1;
    this.counters.set(key, record);
    return { totalHits: record.count, ttlMs: record.expiresAt - now };
  }

  async get(key: string) {
    const now = Date.now();
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.cache.delete(key);
      return undefined;
    }
    return { body: entry.body, statusCode: entry.statusCode, contentType: entry.contentType };
  }

  async set(
    key: string,
    value: { body: any; statusCode?: number; contentType?: string; ttlMs: number },
  ) {
    this.cache.set(key, {
      body: value.body,
      statusCode: value.statusCode,
      contentType: value.contentType,
      expiresAt: Date.now() + value.ttlMs,
    });
  }
}
