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

const app = express();
const store = process.env.REDIS_URL
  ? new RedisStore(new Redis(process.env.REDIS_URL))
  : new MemoryStore();

app.use(rateLimit({ requests: 100, window: 60, store }));
app.use(cache({ cache: true, ttl: 60, store }));

app.get('/time', (_req, res) => res.json({ now: new Date().toISOString() }));
app.listen(3000, () => console.log('http://localhost:3000'));
```

### API

#### rateLimit(options)

- **requests**: max requests within window
- **window**: seconds
- **store**: `RateLimitStore`
- **keyGenerator?**: `(req) => string` (default: IP)

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

#### cache(options)

- **cache**: enable/disable
- **ttl**: seconds
- **store**: `CacheStore`
- **keyGenerator?** / **shouldBypass?**

Adds `X-Cache: HIT|MISS` header. Only affects GET.

### Stores

- **MemoryStore**: in-process; fast; resets on restart; not shared.
- **RedisStore**: shared across instances; uses `INCR`+`EXPIRE` and `SETEX`.

### Scripts

- `npm run dev` – run example app
- `npm run build` – compile to `dist/`
- `npm test` – run tests

### Roadmap

- Token-based limits, pluggable stores, sliding window, bypass rules, adapters, CI/CD.
