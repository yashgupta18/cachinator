import { Request, Response, NextFunction } from 'express';

export interface LogEnrichmentOptions {
  enabled?: boolean;
  logLevel?: 'info' | 'debug' | 'warn' | 'error';
  includeHeaders?: boolean;
  includeUserAgent?: boolean;
  includeResponseTime?: boolean;
  customFields?: (req: Request, res: Response) => Record<string, any>;
}

export function logEnrichment(options: LogEnrichmentOptions = {}) {
  const {
    enabled = true,
    logLevel = 'info',
    includeHeaders = false,
    includeUserAgent = true,
    includeResponseTime = true,
    customFields,
  } = options;

  if (!enabled) {
    return (req: Request, res: Response, next: NextFunction) => next();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Store original log function
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;
    const originalDebug = console.debug;

    // Enhanced log function
    const enhancedLog = (level: string, message: string, ...args: any[]) => {
      const logData = {
        timestamp: new Date().toISOString(),
        level,
        message,
        request: {
          method: req.method,
          url: req.url,
          path: req.path,
          ip: req.ip,
          userAgent: includeUserAgent ? req.get('User-Agent') : undefined,
          headers: includeHeaders ? req.headers : undefined,
        },
        response: {
          statusCode: res.statusCode,
          responseTime: includeResponseTime ? Date.now() - startTime : undefined,
          cacheStatus: res.getHeader('X-Cache') as string,
          rateLimitRemaining: res.getHeader('X-RateLimit-Remaining') as string,
          rateLimitLimit: res.getHeader('X-RateLimit-Limit') as string,
          rateLimitReset: res.getHeader('X-RateLimit-Reset') as string,
        },
        custom: customFields ? customFields(req, res) : {},
        ...args[0] // Allow additional data to be passed
      };

      // Use appropriate console method based on level
      switch (level) {
        case 'error':
          originalError(JSON.stringify(logData, null, 2));
          break;
        case 'warn':
          originalWarn(JSON.stringify(logData, null, 2));
          break;
        case 'info':
          originalInfo(JSON.stringify(logData, null, 2));
          break;
        case 'debug':
          originalDebug(JSON.stringify(logData, null, 2));
          break;
        default:
          originalLog(JSON.stringify(logData, null, 2));
      }
    };

    // Override console methods
    console.log = (message: string, ...args: any[]) => enhancedLog('log', message, ...args);
    console.error = (message: string, ...args: any[]) => enhancedLog('error', message, ...args);
    console.warn = (message: string, ...args: any[]) => enhancedLog('warn', message, ...args);
    console.info = (message: string, ...args: any[]) => enhancedLog('info', message, ...args);
    console.debug = (message: string, ...args: any[]) => enhancedLog('debug', message, ...args);

    // Add enriched logging methods to request object
    req.log = {
      info: (message: string, data?: any) => enhancedLog('info', message, data),
      error: (message: string, data?: any) => enhancedLog('error', message, data),
      warn: (message: string, data?: any) => enhancedLog('warn', message, data),
      debug: (message: string, data?: any) => enhancedLog('debug', message, data),
    };

    // Log request start
    req.log.info('Request started', {
      method: req.method,
      url: req.url,
      ip: req.ip,
    });

    // Override res.end to log response completion
    const originalEnd = res.end;
    res.end = function(chunk?: any, encoding?: any) {
      const responseTime = Date.now() - startTime;

      // Log response completion
      req.log.info('Request completed', {
        statusCode: res.statusCode,
        responseTime,
        cacheStatus: res.getHeader('X-Cache'),
        rateLimitRemaining: res.getHeader('X-RateLimit-Remaining'),
      });

      // Restore original console methods
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      console.info = originalInfo;
      console.debug = originalDebug;

      return originalEnd.call(this, chunk, encoding);
    };

    next();
  };
}

// Extend Express Request interface to include log methods
declare global {
  namespace Express {
    interface Request {
      log: {
        info: (message: string, data?: any) => void;
        error: (message: string, data?: any) => void;
        warn: (message: string, data?: any) => void;
        debug: (message: string, data?: any) => void;
      };
    }
  }
}
