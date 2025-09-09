import express from 'express';
import request from 'supertest';
import { rateLimit } from '../src/lib/rateLimit';
import { keyByHeader, keyByBearerToken, keyByQuery } from '../src/lib/keys';
import { MemoryStore } from '../src/stores/memoryStore';

describe('token-based rate limits', () => {
  test('limits by custom header', async () => {
    const app = express();
    const store = new MemoryStore();
    app.use(
      rateLimit({ requests: 1, window: 5, store, keyGenerator: keyByHeader('x-api-key') }),
    );
    app.get('/', (_req, res) => res.send('ok'));

    const a1 = await request(app).get('/').set('x-api-key', 'A');
    const a2 = await request(app).get('/').set('x-api-key', 'A');
    const b1 = await request(app).get('/').set('x-api-key', 'B');

    expect(a1.status).toBe(200);
    expect(a2.status).toBe(429);
    expect(b1.status).toBe(200);
  });

  test('limits by bearer token', async () => {
    const app = express();
    const store = new MemoryStore();
    app.use(
      rateLimit({ requests: 1, window: 5, store, keyGenerator: keyByBearerToken() }),
    );
    app.get('/', (_req, res) => res.send('ok'));

    const a1 = await request(app).get('/').set('Authorization', 'Bearer tokenA');
    const a2 = await request(app).get('/').set('Authorization', 'Bearer tokenA');
    const b1 = await request(app).get('/').set('Authorization', 'Bearer tokenB');

    expect(a1.status).toBe(200);
    expect(a2.status).toBe(429);
    expect(b1.status).toBe(200);
  });

  test('limits by query param', async () => {
    const app = express();
    const store = new MemoryStore();
    app.use(rateLimit({ requests: 1, window: 5, store, keyGenerator: keyByQuery('api_key') }));
    app.get('/', (_req, res) => res.send('ok'));

    const a1 = await request(app).get('/?api_key=A');
    const a2 = await request(app).get('/?api_key=A');
    const b1 = await request(app).get('/?api_key=B');

    expect(a1.status).toBe(200);
    expect(a2.status).toBe(429);
    expect(b1.status).toBe(200);
  });
});


