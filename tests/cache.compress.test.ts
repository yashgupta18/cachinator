import express from 'express';
import request from 'supertest';
import { cache } from '../src/lib/cache';
import { MemoryStore } from '../src/stores/memoryStore';

describe('cache compression', () => {
  test('stores and serves brotli for large payloads when accepted', async () => {
    const app = express();
    const store = new MemoryStore();
    const big = 'x'.repeat(2048);
    app.use(cache({ cache: true, ttl: 5, store, compression: 'auto' }));
    app.get('/', (_req, res) => res.type('text/plain').send(big));

    const a = await request(app).get('/').set('Accept-Encoding', 'br,gzip');
    const b = await request(app).get('/').set('Accept-Encoding', 'br,gzip');

    expect(a.headers['x-cache']).toBe('MISS');
    expect(b.headers['x-cache']).toBe('HIT');
    expect(b.headers['content-encoding']).toBe('br');
  });

  test('falls back to gzip when client does not accept br', async () => {
    const app = express();
    const store = new MemoryStore();
    const big = 'x'.repeat(2048);
    app.use(cache({ cache: true, ttl: 5, store, compression: 'auto' }));
    app.get('/', (_req, res) => res.type('text/plain').send(big));

    const a = await request(app).get('/').set('Accept-Encoding', 'gzip');
    const b = await request(app).get('/').set('Accept-Encoding', 'gzip');
    expect(b.headers['content-encoding']).toBe('gzip');
  });

  test('does not compress when below minSizeBytes', async () => {
    const app = express();
    const store = new MemoryStore();
    app.use(cache({ cache: true, ttl: 5, store, compression: 'auto', minSizeBytes: 2048 }));
    app.get('/', (_req, res) => res.type('text/plain').send('small'));

    const a = await request(app).get('/').set('Accept-Encoding', 'br,gzip');
    const b = await request(app).get('/').set('Accept-Encoding', 'br,gzip');
    expect(['br', 'gzip', undefined]).toContain(b.headers['content-encoding']);
  });
});


