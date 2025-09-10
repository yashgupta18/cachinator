export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ totalHits: number; ttlMs: number }>; // ttlMs remaining
  // Token bucket support
  getTokens?(key: string): Promise<{ tokens: number; lastRefill: number } | undefined>;
  setTokens?(key: string, tokens: number, lastRefill: number, ttlMs: number): Promise<void>;
  // Sliding window support
  addToWindow?(key: string, timestamp: number, windowMs: number): Promise<{ count: number; oldest: number }>;
}

export interface CacheEntry {
  body: string | Uint8Array;
  statusCode?: number;
  contentType?: string;
  contentEncoding?: 'br' | 'gzip' | undefined;
}

export interface CacheReadResult {
  entry: CacheEntry;
  ttlMs: number; // may be negative if stale
}

export interface CacheStore {
  get(key: string): Promise<CacheEntry | undefined>;
  getWithTTL?(key: string): Promise<CacheReadResult | undefined>;
  set(key: string, value: CacheEntry & { ttlMs: number }): Promise<void> | void;
  delete?(key: string): Promise<void> | void;
}
