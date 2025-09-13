import { Request, Response, NextFunction } from 'express';
import { metricsCollector } from './metrics';

export interface PrometheusOptions {
  path?: string;
  collectDefaultMetrics?: boolean;
  prefix?: string;
}

export function prometheusMetrics(options: PrometheusOptions = {}) {
  const {
    path = '/metrics',
    collectDefaultMetrics = true,
    prefix = 'cachinator_',
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === path) {
      try {
        const metrics = metricsCollector.getPrometheusMetrics();

        res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.status(200).send(metrics);
        return;
      } catch (error) {
        console.error('Error generating Prometheus metrics:', error);
        res.status(500).json({ error: 'Failed to generate metrics' });
        return;
      }
    }

    next();
  };
}

export function createMetricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const originalSend = res.send;

    // Override res.send to capture response time
    res.send = function(body: any) {
      const responseTime = Date.now() - startTime;
      const endpoint = `${req.method} ${req.route?.path || req.path}`;

      // Record metrics
      metricsCollector.recordRequest(endpoint, responseTime);

      // Call original send
      return originalSend.call(this, body);
    };

    next();
  };
}
