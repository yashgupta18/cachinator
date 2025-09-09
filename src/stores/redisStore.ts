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
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  async set(
    key: string,
    value: { body: any; statusCode?: number; contentType?: string; ttlMs: number },
  ) {
    await this.client.setex(key, Math.ceil(value.ttlMs / 1000), JSON.stringify(value));
  }
}
