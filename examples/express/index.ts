import express from 'express';
import Redis from 'ioredis';
import { rateLimit } from '../../src/lib/rateLimit';
import { cache } from '../../src/lib/cache';
import { invalidateMatchingGet, invalidateCache } from '../../src/lib/invalidate';
import { keyByHeader } from '../../src/lib/keys';
import { MemoryStore } from '../../src/stores/memoryStore';
import { RedisStore } from '../../src/stores/redisStore';
import { prometheusMetrics, createMetricsMiddleware } from '../../src/lib/prometheus';
import { createDashboard } from '../../src/lib/dashboard';
import { logEnrichment } from '../../src/lib/logEnrichment';

const app = express();

// Monitoring setup - add these early in the middleware stack
app.use(express.json());

// Log enrichment middleware
app.use(logEnrichment({
  enabled: true,
  logLevel: 'info',
  includeUserAgent: true,
  includeResponseTime: true,
  customFields: (req, res) => ({
    userId: req.headers['x-user-id'] || 'anonymous',
    sessionId: req.headers['x-session-id'] || 'unknown',
  }),
}));

// Metrics collection middleware
app.use(createMetricsMiddleware());

// Prometheus metrics endpoint
app.use(prometheusMetrics({
  path: '/metrics',
  collectDefaultMetrics: true,
}));

// Dashboard route
app.use(createDashboard({
  path: '/express-guard/dashboard',
  title: 'Cachinator Example Dashboard',
  refreshInterval: 5,
}));

const redisUrl = process.env.REDIS_URL;
const store = redisUrl ? new RedisStore(new Redis(redisUrl)) : new MemoryStore();

// Example: switch to token-based limits via x-api-key header with token bucket strategy
app.use(
  rateLimit({
    requests: 10, // 10 requests per window
    window: 60,   // 60 seconds
    store,
    strategy: 'token_bucket',
    burst: 20,    // allow bursts up to 20 requests
    refillRate: 10/60, // refill at 10 requests per 60 seconds
    keyGenerator: keyByHeader('x-api-key', { fallbackToIp: true }),
    hooks: {
      onAllowed: ({ key, remaining, req }) => {
        req.log.info('Rate limit check passed', { key, remaining });
      },
      onBlocked: ({ key, totalHits, req }) => {
        req.log.warn('Rate limit exceeded', { key, totalHits });
      },
      onError: ({ error, req }) => {
        req.log.error('Rate limit error', { error: error.message });
      },
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
    swr: {
      enabled: true,
      revalidateTtlSeconds: 30,
      // Example revalidator: refetch or recompute the data and call ctx.set
      revalidate: async ({ key, set }) => {
        // Demo: set new payload with current timestamp
        await set({ body: JSON.stringify({ refreshedAt: new Date().toISOString() }), contentType: 'application/json' });
        console.log(`[cache] SWR refreshed ${key}`);
      },
    },
    hooks: {
      onHit: ({ key, req }) => {
        req.log.info('Cache hit', { key });
      },
      onMiss: ({ key, req }) => {
        req.log.info('Cache miss', { key });
      },
      onCacheSet: ({ key, statusCode, req }) => {
        req.log.info('Cache set', { key, statusCode });
      },
      onError: ({ error, req }) => {
        req.log.error('Cache error', { error: error.message });
      },
    },
  }),
);

// Sample routes with enriched logging
app.get('/time', (req, res) => {
  req.log.info('Time endpoint requested');
  res.json({ now: new Date().toISOString() });
});

app.get('/hello', (req, res) => {
  req.log.info('Hello endpoint requested');
  res.type('text/plain').send('hello world');
});

app.get('/nocache/ping', (req, res) => {
  req.log.info('Ping endpoint requested (no cache)');
  res.json({ ok: true, ts: Date.now() });
});

app.get('/internal/health', (req, res) => {
  req.log.info('Health check requested');
  res.json({ status: 'ok' });
});

// Large payload route to see brotli/gzip in action
app.get('/large', (req, res) => {
  req.log.info('Large payload requested');
  const big = 'x'.repeat(2048);
  res.type('text/plain').send(big);
});

// API routes for testing
app.get('/api/users', (req, res) => {
  req.log.info('Users API requested');
  // Simulate some processing time
  setTimeout(() => {
    res.json({
      users: [
        { id: 1, name: 'John Doe', email: 'john@example.com' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
      ],
      timestamp: new Date().toISOString(),
    });
  }, Math.random() * 100);
});

app.get('/api/posts', (req, res) => {
  req.log.info('Posts API requested');
  // Simulate some processing time
  setTimeout(() => {
    res.json({
      posts: [
        { id: 1, title: 'Hello World', content: 'This is a sample post' },
        { id: 2, title: 'Another Post', content: 'This is another sample post' },
      ],
      timestamp: new Date().toISOString(),
    });
  }, Math.random() * 200);
});

// Example: invalidate GET cache for the same path after a mutation
app.post('/time', invalidateMatchingGet({ store }), (_req, res) => {
  res.json({ updated: true });
});

// Example: custom invalidation by explicit keys
app.post('/purge',
  invalidateCache({
    store,
    resolveKeys: (req) => {
      const keys = Array.isArray(req.body?.keys) ? req.body.keys : [];
      return keys as string[];
    },
    hooks: {
      onInvalidated: ({ keys }) => console.log('[invalidate] purged', keys),
    },
  }),
  (_req, res) => res.json({ ok: true }),
);

// Example route that will be bypassed by shouldBypass
app.get('/private/data', (_req, res) => {
  res.json({ secret: Math.random() });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`🚀 Example app listening on http://localhost:${port}`);
  console.log(`📊 Dashboard: http://localhost:${port}/express-guard/dashboard`);
  console.log(`📈 Metrics: http://localhost:${port}/metrics`);
  console.log(`🏥 Health: http://localhost:${port}/internal/health`);
  console.log(`\nTry these endpoints:`);
  console.log(`  GET  /time          - Cached timestamp`);
  console.log(`  GET  /hello         - Simple text response`);
  console.log(`  GET  /api/users     - Cached API response`);
  console.log(`  GET  /api/posts     - Another cached API response`);
  console.log(`  GET  /large         - Large payload (compression test)`);
  console.log(`  GET  /nocache/ping  - Non-cached response`);
  console.log(`  POST /time          - Invalidate cache`);
});
