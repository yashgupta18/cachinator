import type { Request, Response, NextFunction } from 'express';
import type { RateLimitStore } from '../types';

export type RateLimitOptions = {
  requests: number;
  window: number; // seconds
  keyGenerator?: (req: Request) => string;
  store: RateLimitStore;
};

export function rateLimit(options: RateLimitOptions) {
  const { requests, window, keyGenerator = (req) => req.ip, store } = options;
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
        res.status(429).json({ error: 'Too Many Requests' });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
