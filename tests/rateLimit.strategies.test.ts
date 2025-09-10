import express from 'express';
import request from 'supertest';
import { rateLimit } from '../src/lib/rateLimit';
import { MemoryStore } from '../src/stores/memoryStore';

describe('rate limit strategies', () => {
  test('token bucket allows bursts then refills', async () => {
    const app = express();
    const store = new MemoryStore();
    app.use(
      rateLimit({
        requests: 2,
        window: 60,
        store,
        strategy: 'token_bucket',
        burst: 3, // allow 3 requests initially
        refillRate: 2/60, // refill 2 tokens per 60 seconds
      }),
    );
    app.get('/', (_req, res) => res.send('ok'));

    // Should allow 3 requests (burst)
    const r1 = await request(app).get('/');
    const r2 = await request(app).get('/');
    const r3 = await request(app).get('/');
    const r4 = await request(app).get('/');

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
    expect(r4.status).toBe(429); // 4th request should be blocked
  });

  test('sliding window counts requests in rolling window', async () => {
    const app = express();
    const store = new MemoryStore();
    app.use(
      rateLimit({
        requests: 2,
        window: 1, // 1 second window
        store,
        strategy: 'sliding_window',
      }),
    );
    app.get('/', (_req, res) => res.send('ok'));

    const r1 = await request(app).get('/');
    const r2 = await request(app).get('/');
    const r3 = await request(app).get('/');

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
  });

  test('fixed window (default) resets at window boundary', async () => {
    const app = express();
    const store = new MemoryStore();
    app.use(
      rateLimit({
        requests: 2,
        window: 1,
        store,
        strategy: 'fixed_window',
      }),
    );
    app.get('/', (_req, res) => res.send('ok'));

    const r1 = await request(app).get('/');
    const r2 = await request(app).get('/');
    const r3 = await request(app).get('/');

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
  });
});
