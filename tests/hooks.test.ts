import express from 'express';
import request from 'supertest';
import { rateLimit } from '../src/lib/rateLimit';
import { cache } from '../src/lib/cache';
import { MemoryStore } from '../src/stores/memoryStore';

describe('hooks', () => {
  test('rateLimit hooks fire', async () => {
    const app = express();
    const store = new MemoryStore();
    const events: string[] = [];
    app.use(
      rateLimit({
        requests: 1,
        window: 60,
        store,
        hooks: {
          onAllowed: ({ key, totalHits, remaining }) =>
            events.push(`allowed:${key}:${totalHits}:${remaining}`),
          onBlocked: ({ key, totalHits }) => events.push(`blocked:${key}:${totalHits}`),
        },
      }),
    );
    app.get('/', (_req, res) => res.send('ok'));

    const r1 = await request(app).get('/');
    const r2 = await request(app).get('/');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(429);
    expect(events.some((e) => e.startsWith('allowed'))).toBe(true);
    expect(events.some((e) => e.startsWith('blocked'))).toBe(true);
  });

  test('cache hooks fire', async () => {
    const app = express();
    const store = new MemoryStore();
    const events: string[] = [];
    app.use(
      cache({
        cache: true,
        ttl: 60,
        store,
        hooks: {
          onHit: ({ key }) => events.push(`hit:${key}`),
          onMiss: ({ key }) => events.push(`miss:${key}`),
          onCacheSet: ({ key, statusCode }) => events.push(`set:${key}:${statusCode}`),
        },
      }),
    );
    app.get('/', (_req, res) => res.json({ ok: true }));

    const a = await request(app).get('/');
    const b = await request(app).get('/');
    expect(a.headers['x-cache']).toBe('MISS');
    expect(b.headers['x-cache']).toBe('HIT');
    expect(events.find((e) => e.startsWith('miss:'))).toBeTruthy();
    expect(events.find((e) => e.startsWith('set:'))).toBeTruthy();
    expect(events.find((e) => e.startsWith('hit:'))).toBeTruthy();
  });
});


