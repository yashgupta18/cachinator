import type { Request, Response, NextFunction } from 'express';
import type { CacheStore } from '../types';

export type CacheOptions = {
  cache: boolean;
  ttl: number; // seconds
  store: CacheStore;
  keyGenerator?: (req: Request) => string;
  shouldBypass?: (req: Request) => boolean;
  bypassPaths?: Array<string | RegExp>;
  hooks?: {
    onHit?: (info: { key: string; req: Request }) => void;
    onMiss?: (info: { key: string; req: Request }) => void;
    onCacheSet?: (info: { key: string; req: Request; statusCode: number }) => void;
    onError?: (info: { error: unknown; req: Request }) => void;
  };
};

export function cache(options: CacheOptions) {
  const { cache: shouldCache, ttl, store, keyGenerator, shouldBypass, bypassPaths, hooks } = options;
  const ttlMs = ttl * 1000;

  return async function cacheMiddleware(req: Request, res: Response, next: NextFunction) {
    if (!shouldCache || req.method !== 'GET') return next();
    if (shouldBypass && shouldBypass(req)) return next();
    if (bypassPaths && bypassPaths.length > 0) {
      const urlPath = req.path || req.originalUrl;
      const matched = bypassPaths.some((p) => (typeof p === 'string' ? urlPath.startsWith(p) : p.test(urlPath)));
      if (matched) return next();
    }

    const key =
      keyGenerator?.(req) ?? `cache:${req.method}:${req.originalUrl.split('?')[0]}:${req.url}`;

    try {
      const cached = await store.get(key);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Content-Type', cached.contentType ?? 'application/json');
        res.status(cached.statusCode ?? 200).send(cached.body);
        hooks?.onHit?.({ key, req });
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
        hooks?.onCacheSet?.({ key, req, statusCode: res.statusCode });
        res.setHeader('X-Cache', 'MISS');
        hooks?.onMiss?.({ key, req });
        return originalSend(body);
      }) as any;

      next();
    } catch (error) {
      hooks?.onError?.({ error, req });
      next(error);
    }
  };
}
