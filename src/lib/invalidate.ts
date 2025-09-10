import type { Request, Response, NextFunction } from 'express';
import type { CacheStore } from '../types';

export function buildDefaultCacheKey(req: Request, method: string = 'GET'): string {
  const path = req.originalUrl.split('?')[0];
  return `cache:${method}:${path}:${req.baseUrl ? req.baseUrl + req.path : req.url}`;
}

export type InvalidateOptions = {
  store: CacheStore;
  keys?: string[];
  resolveKeys?: (req: Request) => string[] | Promise<string[]>;
  hooks?: {
    onInvalidated?: (info: { keys: string[]; req: Request }) => void;
    onError?: (info: { error: unknown; req: Request }) => void;
  };
};

export function invalidateCache(options: InvalidateOptions) {
  const { store, keys, resolveKeys, hooks } = options;
  const hasDelete = typeof store.delete === 'function';

  return async function invalidateMiddleware(req: Request, _res: Response, next: NextFunction) {
    try {
      if (!hasDelete) return next();
      const resolved = [
        ...(keys ?? []),
        ...((await Promise.resolve(resolveKeys?.(req))) ?? []),
      ].filter(Boolean);
      if (resolved.length === 0) return next();

      await Promise.all(resolved.map((k) => (store.delete as (k: string) => Promise<void>)(k)));
      hooks?.onInvalidated?.({ keys: resolved, req });
      next();
    } catch (error) {
      hooks?.onError?.({ error, req });
      next();
    }
  };
}

// Helper to invalidate the GET cache key for the current path
export function invalidateMatchingGet(options: { store: CacheStore }) {
  const { store } = options;
  return invalidateCache({
    store,
    resolveKeys: (req) => [buildDefaultCacheKey(req, 'GET')],
  });
}
