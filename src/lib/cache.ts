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
  // Compression options
  compression?: 'off' | 'br' | 'gzip' | 'auto';
  minSizeBytes?: number; // default 1024
  isCpuOverloaded?: () => boolean; // used in auto mode
  // SWR options
  swr?: {
    enabled: boolean;
    revalidateTtlSeconds?: number; // optional background revalidation TTL
    revalidate?: (ctx: {
      key: string;
      req: Request;
      set: (value: { body: any; statusCode?: number; contentType?: string }) => Promise<void>;
    }) => Promise<void> | void;
  };
};

export function cache(options: CacheOptions) {
  const {
    cache: shouldCache,
    ttl,
    store,
    keyGenerator,
    shouldBypass,
    bypassPaths,
    hooks,
    compression = 'auto',
    minSizeBytes = 1024,
    isCpuOverloaded,
  } = options;
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
      const cachedWithTtl = store.getWithTTL ? await store.getWithTTL(key) : undefined;
      const cached = cachedWithTtl?.entry ?? (await store.get(key));
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Content-Type', cached.contentType ?? 'application/json');
        if (cached.contentEncoding) {
          res.setHeader('Content-Encoding', cached.contentEncoding);
          res.setHeader('Vary', 'Accept-Encoding');
        }
        const isStale = cachedWithTtl ? cachedWithTtl.ttlMs <= 0 : false;
        res.status(cached.statusCode ?? 200).send(cached.body as any);
        hooks?.onHit?.({ key, req });

        // SWR: if stale and swr.enabled, trigger background revalidation via user callback
        if (isStale && options.swr?.enabled && options.swr.revalidate) {
          const ttlForSetMs = (options.swr.revalidateTtlSeconds ?? options.ttl) * 1000;
          const set = async (value: { body: any; statusCode?: number; contentType?: string }) => {
            try {
              // Store raw uncompressed to avoid encoding incompatibilities across clients
              const ct = value.contentType ?? cached.contentType ?? 'application/json';
              let raw: Buffer;
              if (Buffer.isBuffer(value.body)) raw = value.body;
              else if (typeof value.body === 'string') raw = Buffer.from(value.body);
              else raw = Buffer.from(JSON.stringify(value.body));
              await Promise.resolve(
                store.set(key, {
                  body: raw,
                  statusCode: value.statusCode ?? cached.statusCode ?? 200,
                  contentType: ct,
                  contentEncoding: undefined,
                  ttlMs: ttlForSetMs,
                }),
              );
            } catch (e) {
              hooks?.onError?.({ error: e, req });
            }
          };
          // Fire-and-forget
          Promise.resolve(options.swr.revalidate({ key, req, set })).catch((e) =>
            hooks?.onError?.({ error: e, req }),
          );
        }
        return;
      }

      const originalSend = res.send.bind(res);
      res.send = ((body: any) => {
        try {
          const contentType = res.getHeader('Content-Type')?.toString() || 'application/json';
          let raw: Buffer;
          if (Buffer.isBuffer(body)) raw = body;
          else if (typeof body === 'string') raw = Buffer.from(body);
          else raw = Buffer.from(JSON.stringify(body));

          const accept = String(req.headers['accept-encoding'] || '');
          const clientAcceptsBr = /\bbr\b/.test(accept);
          const clientAcceptsGzip = /\bgzip\b/.test(accept);
          const overloaded = isCpuOverloaded?.() === true;
          const largeEnough = raw.length >= minSizeBytes;

          const pickAlgo = (): 'br' | 'gzip' | undefined => {
            if (compression === 'off') return undefined;
            if (!largeEnough) return undefined;
            if (compression === 'br') return clientAcceptsBr ? 'br' : clientAcceptsGzip ? 'gzip' : undefined;
            if (compression === 'gzip') return clientAcceptsGzip ? 'gzip' : undefined;
            // auto
            if (!clientAcceptsBr && clientAcceptsGzip) return 'gzip';
            if (clientAcceptsBr && largeEnough && !overloaded) return 'br';
            return clientAcceptsGzip ? 'gzip' : clientAcceptsBr ? 'br' : undefined;
          };

          const algo = pickAlgo();
          let payload: Buffer = raw;
          let contentEncoding: 'br' | 'gzip' | undefined;
          if (algo) {
            const zlib = require('zlib') as typeof import('zlib');
            if (algo === 'br') {
              payload = zlib.brotliCompressSync(raw);
              contentEncoding = 'br';
            } else if (algo === 'gzip') {
              payload = zlib.gzipSync(raw);
              contentEncoding = 'gzip';
            }
          }

          store.set(key, {
            body: payload,
            statusCode: res.statusCode,
            contentType,
            contentEncoding,
            ttlMs,
          });
          hooks?.onCacheSet?.({ key, req, statusCode: res.statusCode });
          res.setHeader('X-Cache', 'MISS');
          hooks?.onMiss?.({ key, req });

          if (contentEncoding) {
            res.setHeader('Content-Encoding', contentEncoding);
            res.setHeader('Vary', 'Accept-Encoding');
            return originalSend(payload);
          }
          return originalSend(raw);
        } catch (e) {
          hooks?.onError?.({ error: e, req });
          return originalSend(body);
        }
      }) as any;

      next();
    } catch (error) {
      hooks?.onError?.({ error, req });
      next(error);
    }
  };
}
