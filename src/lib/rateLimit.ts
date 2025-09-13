import type { Request, Response, NextFunction } from 'express';
import type { RateLimitStore } from '../types';
import { metricsCollector } from './metrics';

export type RateLimitOptions = {
  requests: number;
  window: number; // seconds
  keyGenerator?: (req: Request) => string;
  store: RateLimitStore;
  strategy?: 'fixed_window' | 'sliding_window' | 'token_bucket';
  // Token bucket specific options
  burst?: number; // max tokens (defaults to requests)
  refillRate?: number; // tokens per second (defaults to requests/window)
  hooks?: {
    onAllowed?: (info: { key: string; totalHits: number; remaining: number; req: Request }) => void;
    onBlocked?: (info: { key: string; totalHits: number; req: Request }) => void;
    onError?: (info: { error: unknown; req: Request }) => void;
  };
};

export function rateLimit(options: RateLimitOptions) {
  const {
    requests,
    window,
    keyGenerator = (req) => req.ip,
    store,
    strategy = 'fixed_window',
    burst,
    refillRate,
    hooks
  } = options;
  const windowMs = window * 1000;

  return async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const key = `rl:${keyGenerator(req)}`;
    try {
      let result: { totalHits: number; ttlMs: number; remaining?: number };

      if (strategy === 'token_bucket') {
        result = await handleTokenBucket(key, store, requests, window, burst, refillRate);
      } else if (strategy === 'sliding_window') {
        result = await handleSlidingWindow(key, store, requests, windowMs);
      } else {
        // fixed_window (default)
        result = await store.increment(key, windowMs);
      }

      const { totalHits, ttlMs, remaining = Math.max(0, requests - totalHits) } = result;

      res.setHeader('X-RateLimit-Limit', String(requests));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      if (ttlMs !== undefined) {
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(ttlMs / 1000)));
      }

      const limit = strategy === 'token_bucket' ? (burst ?? requests) : requests;
      if (totalHits > limit) {
        // Record rate limit block metrics
        metricsCollector.recordRateLimitBlock();
        hooks?.onBlocked?.({ key, totalHits, req });
        res.status(429).json({ error: 'Too Many Requests' });
        return;
      }
      hooks?.onAllowed?.({ key, totalHits, remaining, req });
      next();
    } catch (error) {
      hooks?.onError?.({ error, req });
      next(error);
    }
  };
}

async function handleTokenBucket(
  key: string,
  store: RateLimitStore,
  requests: number,
  window: number,
  burst?: number,
  refillRate?: number
): Promise<{ totalHits: number; ttlMs: number; remaining: number }> {
  const maxTokens = burst ?? requests;
  const tokensPerSecond = refillRate ?? (requests / window);
  const now = Date.now();

  if (!store.getTokens || !store.setTokens) {
    // Fallback to fixed window if store doesn't support token bucket
    const result = await store.increment(key, window * 1000);
    return { ...result, remaining: Math.max(0, requests - result.totalHits) };
  }

  const existing = await store.getTokens(key);
  let tokens = maxTokens;
  let lastRefill = now;

  if (existing) {
    const timePassed = (now - existing.lastRefill) / 1000;
    const tokensToAdd = timePassed * tokensPerSecond;
    tokens = Math.min(maxTokens, existing.tokens + tokensToAdd);
    lastRefill = existing.lastRefill;
  }

  if (tokens < 1) {
    // No tokens available
    const timeToNextToken = (1 - tokens) / tokensPerSecond * 1000;
    await store.setTokens(key, tokens, lastRefill, window * 1000);
    return { totalHits: maxTokens + 1, ttlMs: timeToNextToken, remaining: 0 };
  }

  // Consume one token
  tokens -= 1;
  await store.setTokens(key, tokens, lastRefill, window * 1000);

  return {
    totalHits: maxTokens - tokens,
    ttlMs: window * 1000,
    remaining: Math.floor(tokens)
  };
}

async function handleSlidingWindow(
  key: string,
  store: RateLimitStore,
  requests: number,
  windowMs: number
): Promise<{ totalHits: number; ttlMs: number; remaining: number }> {
  if (!store.addToWindow) {
    // Fallback to fixed window if store doesn't support sliding window
    const result = await store.increment(key, windowMs);
    return { ...result, remaining: Math.max(0, requests - result.totalHits) };
  }

  const now = Date.now();
  const { count, oldest } = await store.addToWindow(key, now, windowMs);

  if (count > requests) {
    const ttlMs = oldest + windowMs - now;
    return { totalHits: count, ttlMs: Math.max(0, ttlMs), remaining: 0 };
  }

  return { totalHits: count, ttlMs: windowMs, remaining: Math.max(0, requests - count) };
}
