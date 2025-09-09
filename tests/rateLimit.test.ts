import express from 'express';
import request from 'supertest';
import { rateLimit } from '../src/lib/rateLimit';
import { MemoryStore } from '../src/stores/memoryStore';

describe('rateLimit middleware', () => {
  test('allows up to N requests within window', async () => {
    const app = express();
    const store = new MemoryStore();
    app.use(rateLimit({ requests: 2, window: 1, store }));
    app.get('/', (_req, res) => res.send('ok'));

    const r1 = await request(app).get('/');
    const r2 = await request(app).get('/');
    const r3 = await request(app).get('/');

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
  });
});


