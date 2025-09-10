export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ totalHits: number; ttlMs: number }>; // ttlMs remaining
}

export interface CacheEntry {
  body: string | Uint8Array;
  statusCode?: number;
  contentType?: string;
  contentEncoding?: 'br' | 'gzip' | undefined;
}

export interface CacheStore {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, value: CacheEntry & { ttlMs: number }): Promise<void> | void;
}
