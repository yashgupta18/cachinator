import express from 'express';
import Redis from 'ioredis';
import { rateLimit } from '../../src/lib/rateLimit';
import { cache } from '../../src/lib/cache';
import { MemoryStore } from '../../src/stores/memoryStore';
import { RedisStore } from '../../src/stores/redisStore';
import { prometheusMetrics, createMetricsMiddleware } from '../../src/lib/prometheus';
import { createDashboard } from '../../src/lib/dashboard';
import { logEnrichment } from '../../src/lib/logEnrichment';

const app = express();
const port = 3000;

// Store configuration
const store = process.env.REDIS_URL
  ? new RedisStore(new Redis(process.env.REDIS_URL))
  : new MemoryStore();

// Middleware setup
app.use(express.json());

// Log enrichment middleware (should be early in the middleware stack)
app.use(
  logEnrichment({
    enabled: true,
    logLevel: 'info',
    includeUserAgent: true,
    includeResponseTime: true,
    customFields: (req, res) => ({
      userId: req.headers['x-user-id'] || 'anonymous',
      sessionId: req.headers['x-session-id'] || 'unknown',
    }),
  }),
);

// Metrics collection middleware
app.use(createMetricsMiddleware());

// Prometheus metrics endpoint
app.use(
  prometheusMetrics({
    path: '/metrics',
    collectDefaultMetrics: true,
  }),
);

// Dashboard route
app.use(
  createDashboard({
    path: '/express-guard/dashboard',
    title: 'Cachinator Monitoring Dashboard',
    refreshInterval: 5,
  }),
);

// Rate limiting middleware
app.use(
  rateLimit({
    requests: 100,
    window: 60, // 1 minute
    store,
    hooks: {
      onAllowed: ({ key, remaining, req }) => {
        req.log.info('Rate limit check passed', { key, remaining });
      },
      onBlocked: ({ key, totalHits, req }) => {
        req.log.warn('Rate limit exceeded', { key, totalHits });
      },
      onError: ({ error, req }) => {
        const err = error instanceof Error ? error : new Error(String(error));
        req.log.error('Rate limit error', { error: err.message });
      },
    },
  }),
);

// Caching middleware
app.use(
  cache({
    cache: true,
    ttl: 60, // 1 minute
    store,
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
        const err = error instanceof Error ? error : new Error(String(error));
        req.log.error('Cache error', { error: err.message });
      },
    },
  }),
);

// Sample routes
app.get('/api/users', (req, res) => {
  // Simulate some processing time
  setTimeout(() => {
    res.json({
      users: [
        { id: 1, name: 'John Doe', email: 'john@example.com' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
      ],
      timestamp: new Date().toISOString(),
    });
  }, Math.random() * 100); // Random delay 0-100ms
});

app.get('/api/posts', (req, res) => {
  // Simulate some processing time
  setTimeout(() => {
    res.json({
      posts: [
        { id: 1, title: 'Hello World', content: 'This is a sample post' },
        { id: 2, title: 'Another Post', content: 'This is another sample post' },
      ],
      timestamp: new Date().toISOString(),
    });
  }, Math.random() * 200); // Random delay 0-200ms
});

app.get('/api/stats', (req, res) => {
  // This endpoint won't be cached (no cache headers)
  res.json({
    serverTime: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
  });
});

app.post('/api/users', (req, res) => {
  // Simulate user creation
  const newUser = {
    id: Date.now(),
    name: req.body.name,
    email: req.body.email,
    createdAt: new Date().toISOString(),
  };

  req.log.info('User created', { userId: newUser.id, name: newUser.name });
  res.status(201).json(newUser);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  req.log.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`📊 Dashboard: http://localhost:${port}/express-guard/dashboard`);
  console.log(`📈 Metrics: http://localhost:${port}/metrics`);
  console.log(`🏥 Health: http://localhost:${port}/health`);
});

export default app;
