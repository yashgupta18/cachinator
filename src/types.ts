export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ totalHits: number; ttlMs: number }>; // ttlMs remaining
}

export interface CacheEntry {
  body: any;
  statusCode?: number;
  contentType?: string;
}

export interface CacheStore {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, value: CacheEntry & { ttlMs: number }): Promise<void> | void;
}

