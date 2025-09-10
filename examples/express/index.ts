import express from 'express';
import Redis from 'ioredis';
import { rateLimit } from '../../src/lib/rateLimit';
import { cache } from '../../src/lib/cache';
import { keyByHeader } from '../../src/lib/keys';
import { MemoryStore } from '../../src/stores/memoryStore';
import { RedisStore } from '../../src/stores/redisStore';

const app = express();

const redisUrl = process.env.REDIS_URL;
const store = redisUrl ? new RedisStore(new Redis(redisUrl)) : new MemoryStore();

// Example: switch to token-based limits via x-api-key header
app.use(
  rateLimit({
    requests: 100,
    window: 60,
    store,
    keyGenerator: keyByHeader('x-api-key', { fallbackToIp: true }),
    hooks: {
      onAllowed: ({ key, remaining }) => console.log(`[rate-limit] allowed ${key}, remaining=${remaining}`),
      onBlocked: ({ key }) => console.warn(`[rate-limit] blocked ${key}`),
    },
  }),
);

app.use(
  cache({
    cache: true,
    ttl: 60,
    store,
    compression: 'auto',
    minSizeBytes: 1024,
    // Dynamically bypass caching based on request
    shouldBypass: (req) => {
      if (req.path.startsWith('/private')) return true; // sensitive routes
      if (req.headers['cache-control'] === 'no-cache') return true; // client opt-out
      return false;
    },
    bypassPaths: ['/nocache', /^\/internal\//],
    swr: { enabled: true, revalidateTtlSeconds: 30 },
    hooks: {
      onHit: ({ key }) => console.log(`[cache] HIT ${key}`),
      onMiss: ({ key }) => console.log(`[cache] MISS ${key}`),
      onCacheSet: ({ key, statusCode }) => console.log(`[cache] SET ${key} -> ${statusCode}`),
      onError: ({ error }) => console.error(`[cache] ERROR`, error),
    },
  }),
);

app.get('/time', (_req, res) => {
  res.json({ now: new Date().toISOString() });
});

app.get('/hello', (_req, res) => {
  res.type('text/plain').send('hello world');
});

app.get('/nocache/ping', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.get('/internal/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Large payload route to see brotli/gzip in action
app.get('/large', (_req, res) => {
  const big = 'x'.repeat(2048);
  res.type('text/plain').send(big);
});

// Example route that will be bypassed by shouldBypass
app.get('/private/data', (_req, res) => {
  res.json({ secret: Math.random() });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Example app listening on http://localhost:${port}`);
});
