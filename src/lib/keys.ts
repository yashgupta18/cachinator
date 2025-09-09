import type { Request } from 'express';

export type KeyGenerator = (req: Request) => string;

export function keyByHeader(
  headerName: string = 'x-api-key',
  options?: { fallbackToIp?: boolean; prefix?: string },
): KeyGenerator {
  const normalized = headerName.toLowerCase();
  const prefix = options?.prefix ?? 'token';
  return (req: Request) => {
    const headerValue = req.header(normalized);
    if (typeof headerValue === 'string' && headerValue.length > 0) {
      return `${prefix}:${headerValue}`;
    }
    if (options?.fallbackToIp) {
      return `${prefix}-ip:${req.ip}`;
    }
    return `${prefix}:anonymous`;
  };
}

export function keyByBearerToken(
  options?: { headerName?: string; fallbackToIp?: boolean; prefix?: string },
): KeyGenerator {
  const headerName = (options?.headerName ?? 'authorization').toLowerCase();
  const prefix = options?.prefix ?? 'bearer';
  return (req: Request) => {
    const auth = req.header(headerName) || '';
    const match = /^Bearer\s+(.+)$/i.exec(auth);
    const token = match?.[1];
    if (token) return `${prefix}:${token}`;
    if (options?.fallbackToIp) return `${prefix}-ip:${req.ip}`;
    return `${prefix}:anonymous`;
  };
}

export function keyByQuery(
  paramName: string = 'api_key',
  options?: { fallbackToIp?: boolean; prefix?: string },
): KeyGenerator {
  const prefix = options?.prefix ?? 'query';
  return (req: Request) => {
    const value = (req.query?.[paramName] as string | undefined) ?? '';
    if (value) return `${prefix}:${value}`;
    if (options?.fallbackToIp) return `${prefix}-ip:${req.ip}`;
    return `${prefix}:anonymous`;
  };
}

export function keyByUser(
  extractor: (req: Request) => string | number | undefined,
  options?: { fallbackToIp?: boolean; prefix?: string },
): KeyGenerator {
  const prefix = options?.prefix ?? 'user';
  return (req: Request) => {
    const id = extractor(req);
    if (id !== undefined && id !== null && `${id}`.length > 0) return `${prefix}:${id}`;
    if (options?.fallbackToIp) return `${prefix}-ip:${req.ip}`;
    return `${prefix}:anonymous`;
  };
}


