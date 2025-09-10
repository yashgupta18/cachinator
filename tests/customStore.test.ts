import express from 'express';
import request from 'supertest';
import { rateLimit } from '../src/lib/rateLimit';
import { cache } from '../src/lib/cache';
import type { RateLimitStore, CacheStore } from '../src/types';

class InMemoryCustomStore implements RateLimitStore, CacheStore {
  private counters = new Map<string, { count: number; expiresAt: number }>();
  private cache = new Map<string, { body: any; statusCode?: number; contentType?: string; expiresAt: number }>();

  async increment(key: string, windowMs: number) {
    const now = Date.now();
    const record = this.counters.get(key);
    if (!record || record.expiresAt <= now) {
      const expiresAt = now + windowMs;
      this.counters.set(key, { count: 1, expiresAt });
      return { totalHits: 1, ttlMs: expiresAt - now };
    }
    record.count += 1;
    return { totalHits: record.count, ttlMs: record.expiresAt - now };
  }

  async get(key: string) {
    const now = Date.now();
    const entry = this.cache.get(key);
    if (!entry || entry.expiresAt <= now) return undefined;
    return { body: entry.body, statusCode: entry.statusCode, contentType: entry.contentType };
  }

  async set(key: string, value: { body: any; statusCode?: number; contentType?: string; ttlMs: number }) {
    this.cache.set(key, {
      body: value.body,
      statusCode: value.statusCode,
      contentType: value.contentType,
      expiresAt: Date.now() + value.ttlMs,
    });
  }
}

describe('pluggable custom store', () => {
  test('works for rate limiting', async () => {
    const app = express();
    const store = new InMemoryCustomStore();
    app.use(rateLimit({ requests: 1, window: 1, store }));
    app.get('/', (_req, res) => res.send('ok'));

    const r1 = await request(app).get('/');
    const r2 = await request(app).get('/');

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(429);
  });

  test('works for caching', async () => {
    const app = express();
    const store = new InMemoryCustomStore();
    let hits = 0;
    app.use(cache({ cache: true, ttl: 1, store, compression: 'off' }));
    app.get('/', (_req, res) => {
      hits += 1;
      // Ensure JSON content-type is set predictably for the test client
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({ hits }));
    });

    const a = await request(app).get('/').set('Accept', 'application/json');
    const b = await request(app).get('/').set('Accept', 'application/json');
    expect(a.headers['x-cache']).toBe('MISS');
    expect(b.headers['x-cache']).toBe('HIT');
    expect(JSON.parse(a.text)).toEqual({ hits: 1 });
    expect(JSON.parse(b.text)).toEqual({ hits: 1 });
  });
});
