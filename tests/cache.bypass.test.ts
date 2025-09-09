import express from 'express';
import request from 'supertest';
import { cache } from '../src/lib/cache';
import { MemoryStore } from '../src/stores/memoryStore';

describe('cache bypass rules', () => {
  test('bypasses via shouldBypass', async () => {
    const app = express();
    const store = new MemoryStore();
    let hits = 0;
    app.use(
      cache({
        cache: true,
        ttl: 60,
        store,
        shouldBypass: (req) => req.path.startsWith('/private'),
      }),
    );
    app.get('/private/data', (_req, res) => res.json({ hits: ++hits }));

    const r1 = await request(app).get('/private/data');
    const r2 = await request(app).get('/private/data');
    expect(r1.headers['x-cache']).toBeUndefined();
    expect(r2.headers['x-cache']).toBeUndefined();
    expect(r2.body.hits).toBe(2);
  });

  test('bypasses via path list (string and regex)', async () => {
    const app = express();
    const store = new MemoryStore();
    let hits = 0;
    app.use(cache({ cache: true, ttl: 60, store, bypassPaths: ['/no-cache', /^\/admin\//] }));
    app.get('/no-cache', (_req, res) => res.json({ hits: ++hits }));
    app.get('/admin/panel', (_req, res) => res.json({ hits: ++hits }));

    const a1 = await request(app).get('/no-cache');
    const a2 = await request(app).get('/no-cache');
    const b1 = await request(app).get('/admin/panel');
    const b2 = await request(app).get('/admin/panel');
    expect(a1.headers['x-cache']).toBeUndefined();
    expect(a2.headers['x-cache']).toBeUndefined();
    expect(b1.headers['x-cache']).toBeUndefined();
    expect(b2.headers['x-cache']).toBeUndefined();
  });
});
