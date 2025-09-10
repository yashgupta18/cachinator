import type { CacheStore, RateLimitStore } from '../types';

type Counter = {
  count: number;
  expiresAt: number; // timestamp ms
};

export class MemoryStore implements RateLimitStore, CacheStore {
  private readonly counters = new Map<string, Counter>();
  private readonly cache = new Map<string, { body: string | Uint8Array; statusCode?: number; contentType?: string; contentEncoding?: 'br' | 'gzip'; expiresAt: number }>();
  private readonly tokenBuckets = new Map<string, { tokens: number; lastRefill: number; expiresAt: number }>();
  private readonly slidingWindows = new Map<string, { timestamps: number[]; expiresAt: number }>();

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
    return { body: entry.body, statusCode: entry.statusCode, contentType: entry.contentType, contentEncoding: entry.contentEncoding };
  }

  async getWithTTL(key: string) {
    const now = Date.now();
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    const ttlMs = entry.expiresAt - now;
    return {
      entry: { body: entry.body, statusCode: entry.statusCode, contentType: entry.contentType, contentEncoding: entry.contentEncoding },
      ttlMs,
    };
  }

  async set(
    key: string,
    value: { body: string | Uint8Array; statusCode?: number; contentType?: string; contentEncoding?: 'br' | 'gzip'; ttlMs: number },
  ) {
    this.cache.set(key, {
      body: value.body,
      statusCode: value.statusCode,
      contentType: value.contentType,
      contentEncoding: value.contentEncoding,
      expiresAt: Date.now() + value.ttlMs,
    });
  }

  async delete(key: string) {
    this.cache.delete(key);
  }

  // Token bucket methods
  async getTokens(key: string) {
    const now = Date.now();
    const bucket = this.tokenBuckets.get(key);
    if (!bucket || bucket.expiresAt <= now) {
      this.tokenBuckets.delete(key);
      return undefined;
    }
    return { tokens: bucket.tokens, lastRefill: bucket.lastRefill };
  }

  async setTokens(key: string, tokens: number, lastRefill: number, ttlMs: number) {
    this.tokenBuckets.set(key, {
      tokens,
      lastRefill,
      expiresAt: Date.now() + ttlMs,
    });
  }

  // Sliding window methods
  async addToWindow(key: string, timestamp: number, windowMs: number) {
    const now = Date.now();
    let window = this.slidingWindows.get(key);

    if (!window || window.expiresAt <= now) {
      window = { timestamps: [], expiresAt: now + windowMs };
      this.slidingWindows.set(key, window);
    }

    // Remove timestamps outside the window
    const cutoff = now - windowMs;
    window.timestamps = window.timestamps.filter(ts => ts > cutoff);

    // Add new timestamp
    window.timestamps.push(timestamp);

    return {
      count: window.timestamps.length,
      oldest: window.timestamps.length > 0 ? Math.min(...window.timestamps) : timestamp,
    };
  }
}
