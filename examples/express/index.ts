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
app.use(rateLimit({ requests: 100, window: 60, store, keyGenerator: keyByHeader('x-api-key', { fallbackToIp: true }) }));

app.use(
  cache({
    cache: true,
    ttl: 60,
    store,
  }),
);

app.get('/time', (_req, res) => {
  res.json({ now: new Date().toISOString() });
});

app.get('/hello', (_req, res) => {
  res.type('text/plain').send('hello world');
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Example app listening on http://localhost:${port}`);
});
