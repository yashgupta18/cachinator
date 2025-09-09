import express from 'express';
import request from 'supertest';
import { cache } from '../src/lib/cache';
import { MemoryStore } from '../src/stores/memoryStore';

describe('cache middleware', () => {
  test('caches GET responses', async () => {
    const app = express();
    const store = new MemoryStore();
    let hits = 0;

    app.use(cache({ cache: true, ttl: 1, store }));
    app.get('/', (_req, res) => {
      hits += 1;
      res.json({ hits });
    });

    const r1 = await request(app).get('/');
    const r2 = await request(app).get('/');

    expect(r1.headers['x-cache']).toBe('MISS');
    expect(r2.headers['x-cache']).toBe('HIT');
    expect(r1.body).toEqual({ hits: 1 });
    expect(r2.body).toEqual({ hits: 1 });
  });
});


