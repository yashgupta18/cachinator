import type { Request, Response, NextFunction } from 'express';
import type { CacheStore } from '../types';

export type CacheOptions = {
  cache: boolean;
  ttl: number; // seconds
  store: CacheStore;
  keyGenerator?: (req: Request) => string;
  shouldBypass?: (req: Request) => boolean;
};

export function cache(options: CacheOptions) {
  const { cache: shouldCache, ttl, store, keyGenerator, shouldBypass } = options;
  const ttlMs = ttl * 1000;

  return async function cacheMiddleware(req: Request, res: Response, next: NextFunction) {
    if (!shouldCache || req.method !== 'GET') return next();
    if (shouldBypass && shouldBypass(req)) return next();

    const key =
      keyGenerator?.(req) ?? `cache:${req.method}:${req.originalUrl.split('?')[0]}:${req.url}`;

    try {
      const cached = await store.get(key);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Content-Type', cached.contentType ?? 'application/json');
        res.status(cached.statusCode ?? 200).send(cached.body);
        return;
      }

      const originalSend = res.send.bind(res);
      res.send = ((body: any) => {
        store.set(key, {
          body,
          statusCode: res.statusCode,
          contentType: res.getHeader('Content-Type')?.toString(),
          ttlMs,
        });
        res.setHeader('X-Cache', 'MISS');
        return originalSend(body);
      }) as any;

      next();
    } catch (error) {
      next(error);
    }
  };
}
