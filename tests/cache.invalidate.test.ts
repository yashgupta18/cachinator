import express from 'express';
import request from 'supertest';
import { cache } from '../src/lib/cache';
import { invalidateMatchingGet } from '../src/lib/invalidate';
import { MemoryStore } from '../src/stores/memoryStore';

describe('cache invalidation middleware', () => {
  test('invalidates GET cache for same path after POST', async () => {
    const app = express();
    app.use(express.json());
    const store = new MemoryStore();
    let hits = 0;
    app.use(cache({ cache: true, ttl: 60, store, compression: 'off' }));
    app.get('/data', (_req, res) => {
      hits += 1;
      res.json({ hits });
    });
    app.post('/data', invalidateMatchingGet({ store }), (_req, res) => res.json({ ok: true }));

    const a1 = await request(app).get('/data');
    const a2 = await request(app).get('/data');
    expect(a1.headers['x-cache']).toBe('MISS');
    expect(a2.headers['x-cache']).toBe('HIT');

    const p = await request(app).post('/data');
    expect(p.status).toBe(200);

    const a3 = await request(app).get('/data');
    expect(a3.headers['x-cache']).toBe('MISS');
    expect(a3.body.hits).toBe(2);
  });
});
