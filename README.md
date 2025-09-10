## Rate Limiting + Caching Middleware (TypeScript)

Simple middlewares for Express that provide:

- **Rate limiting** with window-based counters
- **Response caching** for GET requests with TTL
- **Stores**: Redis (shared, production) or in-memory (dev/tests)

### Installation

```bash
npm install express ioredis
```

### Quick start (Express)

```ts
import express from 'express';
import Redis from 'ioredis';
import { rateLimit, cache, MemoryStore, RedisStore } from 'rate-limit-pkg';
import { keyByHeader, keyByBearerToken, keyByQuery } from 'rate-limit-pkg';
import { invalidateMatchingGet, invalidateCache } from 'rate-limit-pkg';

const app = express();
const store = process.env.REDIS_URL
  ? new RedisStore(new Redis(process.env.REDIS_URL))
  : new MemoryStore();

// Per-IP (default):
app.use(rateLimit({ requests: 100, window: 60, store }));

// Or token-based examples:
app.use(
  rateLimit({
    requests: 100,
    window: 60,
    store,
    keyGenerator: keyByHeader('x-api-key', { fallbackToIp: true }),
  }),
);
app.use(
  rateLimit({
    requests: 100,
    window: 60,
    store,
    keyGenerator: keyByBearerToken({ fallbackToIp: true }),
  }),
);
app.use(
  rateLimit({
    requests: 100,
    window: 60,
    store,
    keyGenerator: keyByQuery('api_key', { fallbackToIp: true }),
  }),
);
app.use(cache({ cache: true, ttl: 60, store }));

app.get('/time', (_req, res) => res.json({ now: new Date().toISOString() }));
app.listen(3000, () => console.log('http://localhost:3000'));
```

### Invalidation middleware

Invalidate the cached GET for a route after a mutation:

```ts
app.post('/users/:id', invalidateMatchingGet({ store }), (req, res) => {
  // ...perform update
  res.json({ ok: true });
});
```

Purge custom keys:

```ts
app.post(
  '/purge',
  invalidateCache({
    store,
    resolveKeys: (req) => req.body.keys as string[],
  }),
  (req, res) => res.json({ ok: true }),
);
```

### API

#### rateLimit(options)

- **requests**: max requests within window
- **window**: seconds
- **store**: `RateLimitStore`
- **keyGenerator?**: `(req) => string` (default: IP)
- **strategy?**: `'fixed_window' | 'sliding_window' | 'token_bucket'` (default: `'fixed_window'`)
- **burst?**: number (token bucket only) – max tokens (defaults to requests)
- **refillRate?**: number (token bucket only) – tokens per second (defaults to requests/window)
- **hooks?**: `{ onAllowed, onBlocked, onError }`

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

Example with token bucket:

```ts
app.use(
  rateLimit({
    requests: 10,
    window: 60,
    store,
    strategy: 'token_bucket',
    burst: 20, // allow bursts up to 20 requests
    refillRate: 10 / 60, // refill at 10 requests per 60 seconds
  }),
);
```

#### cache(options)

- **cache**: enable/disable
- **ttl**: seconds
- **store**: `CacheStore`
- **keyGenerator?** / **shouldBypass?**
- **bypassPaths?**: `Array<string | RegExp>` – skip caching for matching paths
- **hooks?**: `{ onHit, onMiss, onCacheSet, onError }`
- **compression?**: `'off' | 'br' | 'gzip' | 'auto'` (default `'auto'`)
- **minSizeBytes?**: number (default 1024) – only compress bodies ≥ this size
- **isCpuOverloaded?**: `() => boolean` – used to fall back from br to gzip in auto mode
- **swr?**: `{ enabled: boolean, revalidateTtlSeconds?: number }`
  - `revalidate?: (ctx) => Promise<void>` – background refresh handler; call `ctx.set(...)` with new payload

Adds `X-Cache: HIT|MISS` header. Only affects GET.
Example (compression + SWR + bypass):

```ts
app.use(
  cache({
    cache: true,
    ttl: 60,
    store,
    compression: 'auto',
    minSizeBytes: 1024,
    swr: {
      enabled: true,
      revalidateTtlSeconds: 30,
      revalidate: async ({ key, set }) => {
        // recompute or refetch and update cache
        await set({
          body: JSON.stringify({ refreshedAt: new Date().toISOString() }),
          contentType: 'application/json',
        });
        console.log('SWR refreshed', key);
      },
    },
    shouldBypass: (req) => req.headers['cache-control'] === 'no-cache',
    bypassPaths: ['/nocache', /^\/internal\//],
    hooks: {
      onHit: ({ key }) => console.log('HIT', key),
      onMiss: ({ key }) => console.log('MISS', key),
      onCacheSet: ({ key, statusCode }) => console.log('SET', key, statusCode),
    },
  }),
);
```

Try it:

```bash
curl -H 'Accept-Encoding: br,gzip' http://localhost:3000/large -i
curl -H 'Accept-Encoding: gzip' http://localhost:3000/large -i
```

Example (bypass + hooks):

```ts
app.use(
  cache({
    cache: true,
    ttl: 60,
    store,
    bypassPaths: ['/nocache', /^\/internal\//],
    hooks: {
      onHit: ({ key }) => console.log('HIT', key),
      onMiss: ({ key }) => console.log('MISS', key),
      onCacheSet: ({ key, statusCode }) => console.log('SET', key, statusCode),
      onError: ({ error }) => console.error('CACHE ERROR', error),
    },
  }),
);
```

Example (rate limit hooks):

```ts
app.use(
  rateLimit({
    requests: 100,
    window: 60,
    store,
    hooks: {
      onAllowed: ({ key, remaining }) => console.log('ALLOWED', key, remaining),
      onBlocked: ({ key }) => console.warn('BLOCKED', key),
      onError: ({ error }) => console.error('RL ERROR', error),
    },
  }),
);
```

### Stores

- **MemoryStore**: in-process; fast; resets on restart; not shared.
- **RedisStore**: shared across instances; uses `INCR`+`EXPIRE` and `SETEX`.

#### Custom stores (pluggable)

Implement your own store by matching these interfaces:

```ts
export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ totalHits: number; ttlMs: number }>;
}

export interface CacheEntry {
  body: any;
  statusCode?: number;
  contentType?: string;
}

export interface CacheStore {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, value: CacheEntry & { ttlMs: number }): Promise<void> | void;
}
```

Example:

```ts
import type { RateLimitStore, CacheStore } from 'rate-limit-pkg';

class MyStore implements RateLimitStore, CacheStore {
  async increment(key: string, windowMs: number) {
    /* ... */ return { totalHits: 1, ttlMs: windowMs };
  }
  async get(key: string) {
    /* ... */ return undefined;
  }
  async set(
    key: string,
    value: { body: any; statusCode?: number; contentType?: string; ttlMs: number },
  ) {
    /* ... */
  }
}

const store = new MyStore();
app.use(rateLimit({ requests: 100, window: 60, store }));
app.use(cache({ cache: true, ttl: 60, store }));
```

### Scripts

- `npm run dev` – run example app
- `npm run build` – compile to `dist/`
- `npm test` – run tests

### Roadmap

- Token-based limits, pluggable stores, sliding window, bypass rules, adapters, CI/CD.
