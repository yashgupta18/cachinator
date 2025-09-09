import type { Request, Response, NextFunction } from 'express';
import type { RateLimitStore } from '../types';

export type RateLimitOptions = {
  requests: number;
  window: number; // seconds
  keyGenerator?: (req: Request) => string;
  store: RateLimitStore;
  hooks?: {
    onAllowed?: (info: { key: string; totalHits: number; remaining: number; req: Request }) => void;
    onBlocked?: (info: { key: string; totalHits: number; req: Request }) => void;
    onError?: (info: { error: unknown; req: Request }) => void;
  };
};

export function rateLimit(options: RateLimitOptions) {
  const { requests, window, keyGenerator = (req) => req.ip, store, hooks } = options;
  const windowMs = window * 1000;

  return async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const key = `rl:${keyGenerator(req)}`;
    try {
      const { totalHits, ttlMs } = await store.increment(key, windowMs);
      res.setHeader('X-RateLimit-Limit', String(requests));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, requests - totalHits)));
      if (ttlMs !== undefined) {
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(ttlMs / 1000)));
      }

      if (totalHits > requests) {
        hooks?.onBlocked?.({ key, totalHits, req });
        res.status(429).json({ error: 'Too Many Requests' });
        return;
      }
      hooks?.onAllowed?.({ key, totalHits, remaining: Math.max(0, requests - totalHits), req });
      next();
    } catch (error) {
      hooks?.onError?.({ error, req });
      next(error);
    }
  };
}
