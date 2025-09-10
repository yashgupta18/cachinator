import Redis from 'ioredis';
import type { CacheStore, RateLimitStore } from '../types';

export class RedisStore implements RateLimitStore, CacheStore {
  constructor(private readonly client: Redis) {}

  async increment(key: string, windowMs: number): Promise<{ totalHits: number; ttlMs: number }> {
    const ttlSeconds = Math.ceil(windowMs / 1000);
    const pipeline = this.client.multi();
    pipeline.incr(key);
    pipeline.expire(key, ttlSeconds);
    const results = (await pipeline.exec()) as [Error | null, number][];
    const totalHits = Number(results[0][1]);
    const ttl = await this.client.ttl(key);
    return { totalHits, ttlMs: ttl > 0 ? ttl * 1000 : windowMs };
  }

  async get(key: string) {
    const raw = await this.client.get(key);
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw) as any;
      if (parsed && parsed.__isBase64 && typeof parsed.body === 'string') {
        parsed.body = Buffer.from(parsed.body, 'base64');
        delete parsed.__isBase64;
      }
      return parsed;
    } catch {
      return undefined;
    }
  }

  async getWithTTL(key: string) {
    const raw = await this.client.get(key);
    if (!raw) return undefined;
    let entry: any;
    try {
      entry = JSON.parse(raw);
    } catch {
      return undefined;
    }
    if (entry && entry.__isBase64 && typeof entry.body === 'string') {
      entry.body = Buffer.from(entry.body, 'base64');
      delete entry.__isBase64;
    }
    const ttl = await this.client.pttl(key); // milliseconds, -1/-2 for special
    return { entry, ttlMs: typeof ttl === 'number' ? ttl : 0 };
  }

  async set(
    key: string,
    value: { body: string | Uint8Array; statusCode?: number; contentType?: string; contentEncoding?: 'br' | 'gzip'; ttlMs: number },
  ) {
    const toStore = {
      ...value,
      // Ensure Buffer is base64-encoded for JSON storage
      body: Buffer.isBuffer(value.body) ? (value.body as Buffer).toString('base64') : value.body,
      __isBase64: Buffer.isBuffer(value.body) ? true : false,
    };
    await this.client.setex(key, Math.ceil(value.ttlMs / 1000), JSON.stringify(toStore));
  }

  async delete(key: string) {
    await this.client.del(key);
  }
}
