# Cachinator

Rate limiting + caching middleware for Express with Redis and memory fallback.

## Features

- **Rate limiting** with window-based counters
- **Response caching** for GET requests with TTL
- **Stores**: Redis (shared, production) or in-memory (dev/tests)
- **TypeScript** support with full type definitions
- **Monitoring & Observability**:
  - Prometheus metrics endpoint (`/metrics`)
  - Real-time dashboard (`/express-guard/dashboard`)
  - Log enrichment with cache and rate-limit info
  - Charts showing requests over time, cache hit ratio, and top endpoints

## Installation

```bash
npm install cachinator express ioredis
```

### Quick start (Express)

```ts
import express from 'express';
import Redis from 'ioredis';
import {
  rateLimit,
  cache,
  MemoryStore,
  RedisStore,
  prometheusMetrics,
  createMetricsMiddleware,
  createDashboard,
  logEnrichment,
} from 'cachinator';
import { keyByHeader, keyByBearerToken, keyByQuery } from 'cachinator';
import { invalidateMatchingGet, invalidateCache } from 'cachinator';

const app = express();

// Monitoring setup
app.use(logEnrichment({ enabled: true }));
app.use(createMetricsMiddleware());
app.use(prometheusMetrics({ path: '/metrics' }));
app.use(createDashboard({ path: '/express-guard/dashboard' }));

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

### Monitoring & Observability

Cachinator includes comprehensive monitoring features:

#### Prometheus Metrics

Access metrics at `/metrics` endpoint:

**Counters:**

- `cachinator_cache_hits_total` - Total cache hits
- `cachinator_cache_misses_total` - Total cache misses
- `cachinator_rate_limit_blocks_total` - Total rate limit blocks
- `cachinator_requests_total` - Total requests
- `cachinator_endpoint_hits_total` - Hits per endpoint

**Gauges:**

- `cachinator_cache_hit_ratio` - Cache hit ratio (0-1)
- `cachinator_response_time_seconds_avg` - Average response time

**Histograms:**

- `cachinator_response_time_seconds` - Response time histogram
  - `cachinator_response_time_seconds_bucket{le="0.001"}` - Requests ≤ 1ms
  - `cachinator_response_time_seconds_bucket{le="0.005"}` - Requests ≤ 5ms
  - `cachinator_response_time_seconds_bucket{le="0.01"}` - Requests ≤ 10ms
  - `cachinator_response_time_seconds_bucket{le="0.025"}` - Requests ≤ 25ms
  - `cachinator_response_time_seconds_bucket{le="0.05"}` - Requests ≤ 50ms
  - `cachinator_response_time_seconds_bucket{le="0.1"}` - Requests ≤ 100ms
  - `cachinator_response_time_seconds_bucket{le="0.25"}` - Requests ≤ 250ms
  - `cachinator_response_time_seconds_bucket{le="0.5"}` - Requests ≤ 500ms
  - `cachinator_response_time_seconds_bucket{le="1.0"}` - Requests ≤ 1s
  - `cachinator_response_time_seconds_bucket{le="2.5"}` - Requests ≤ 2.5s
  - `cachinator_response_time_seconds_bucket{le="5.0"}` - Requests ≤ 5s
  - `cachinator_response_time_seconds_bucket{le="10.0"}` - Requests ≤ 10s
  - `cachinator_response_time_seconds_bucket{le="+Inf"}` - All requests
  - `cachinator_response_time_seconds_sum` - Total response time
  - `cachinator_response_time_seconds_count` - Total request count

**Calculating Percentiles:**

```promql
# 95th percentile response time
histogram_quantile(0.95, rate(cachinator_response_time_seconds_bucket[5m]))

# 99th percentile response time
histogram_quantile(0.99, rate(cachinator_response_time_seconds_bucket[5m]))

# 50th percentile (median) response time
histogram_quantile(0.50, rate(cachinator_response_time_seconds_bucket[5m]))
```

#### Real-time Dashboard

Access the dashboard at `/express-guard/dashboard`:

- Live metrics and statistics
- Charts showing requests over time
- Cache hit ratio visualization
- Top endpoints by hits
- Auto-refreshing every 5 seconds

#### Log Enrichment

Enhanced logging with cache and rate-limit information:

```ts
app.use(
  logEnrichment({
    enabled: true,
    logLevel: 'info',
    includeUserAgent: true,
    includeResponseTime: true,
    customFields: (req, res) => ({
      userId: req.headers['x-user-id'],
      sessionId: req.headers['x-session-id'],
    }),
  }),
);

// Use enriched logging in your routes
app.get('/api/data', (req, res) => {
  req.log.info('Data requested', { endpoint: '/api/data' });
  // ... your logic
});
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
import type { RateLimitStore, CacheStore } from 'cachinator';

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
- `npm publish` – publish to npm (CI will publish on tags)

### CI/CD & Releases

- **Automated releases** with semantic-release
- **Conventional commits** for automatic versioning
- **GitHub Actions** for CI/CD
- **NPM publishing** on every release

#### Release Process

1. Make changes with conventional commit messages:
   - `feat: add new feature` → Minor version bump
   - `fix: resolve bug` → Patch version bump
   - `feat!: breaking change` → Major version bump
2. Push to `main` branch
3. Semantic-release automatically:
   - Analyzes commits
   - Updates version
   - Generates changelog
   - Publishes to npm
   - Creates GitHub release

### Roadmap

- Token-based limits, pluggable stores, sliding window, bypass rules, adapters, CI/CD.
