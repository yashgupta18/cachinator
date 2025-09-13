export interface MetricsData {
  cacheHits: number;
  cacheMisses: number;
  rateLimitBlocks: number;
  totalRequests: number;
  responseTimeSum: number;
  responseTimeCount: number;
  endpointHits: Map<string, number>;
  timestamp: number;
}

export class MetricsCollector {
  private metrics: MetricsData = {
    cacheHits: 0,
    cacheMisses: 0,
    rateLimitBlocks: 0,
    totalRequests: 0,
    responseTimeSum: 0,
    responseTimeCount: 0,
    endpointHits: new Map(),
    timestamp: Date.now(),
  };

  private history: MetricsData[] = [];
  private readonly maxHistorySize = 1000; // Keep last 1000 data points

  recordCacheHit(): void {
    this.metrics.cacheHits++;
  }

  recordCacheMiss(): void {
    this.metrics.cacheMisses++;
  }

  recordRateLimitBlock(): void {
    this.metrics.rateLimitBlocks++;
  }

  recordRequest(endpoint: string, responseTime: number): void {
    this.metrics.totalRequests++;
    this.metrics.responseTimeSum += responseTime;
    this.metrics.responseTimeCount++;

    const currentHits = this.metrics.endpointHits.get(endpoint) || 0;
    this.metrics.endpointHits.set(endpoint, currentHits + 1);
  }

  getCurrentMetrics(): MetricsData {
    return { ...this.metrics };
  }

  getMetricsHistory(): MetricsData[] {
    return [...this.history];
  }

  getPrometheusMetrics(): string {
    const current = this.getCurrentMetrics();
    const cacheHitRatio = current.cacheHits + current.cacheMisses > 0
      ? current.cacheHits / (current.cacheHits + current.cacheMisses)
      : 0;
    const avgResponseTime = current.responseTimeCount > 0
      ? current.responseTimeSum / current.responseTimeCount
      : 0;

    let metrics = `# HELP cachinator_cache_hits_total Total number of cache hits
# TYPE cachinator_cache_hits_total counter
cachinator_cache_hits_total ${current.cacheHits}

# HELP cachinator_cache_misses_total Total number of cache misses
# TYPE cachinator_cache_misses_total counter
cachinator_cache_misses_total ${current.cacheMisses}

# HELP cachinator_cache_hit_ratio Cache hit ratio (0-1)
# TYPE cachinator_cache_hit_ratio gauge
cachinator_cache_hit_ratio ${cacheHitRatio}

# HELP cachinator_rate_limit_blocks_total Total number of rate limit blocks
# TYPE cachinator_rate_limit_blocks_total counter
cachinator_rate_limit_blocks_total ${current.rateLimitBlocks}

# HELP cachinator_requests_total Total number of requests
# TYPE cachinator_requests_total counter
cachinator_requests_total ${current.totalRequests}

# HELP cachinator_response_time_seconds Average response time in seconds
# TYPE cachinator_response_time_seconds gauge
cachinator_response_time_seconds ${avgResponseTime / 1000}

`;

    // Add endpoint-specific metrics
    for (const [endpoint, hits] of current.endpointHits) {
      const sanitizedEndpoint = endpoint.replace(/[^a-zA-Z0-9_]/g, '_');
      metrics += `# HELP cachinator_endpoint_hits_total Total hits per endpoint
# TYPE cachinator_endpoint_hits_total counter
cachinator_endpoint_hits_total{endpoint="${sanitizedEndpoint}"} ${hits}
`;
    }

    return metrics;
  }

  snapshot(): void {
    // Save current metrics to history
    this.history.push({ ...this.metrics });

    // Keep only the last maxHistorySize entries
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }

    // Reset current metrics for next period
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      rateLimitBlocks: 0,
      totalRequests: 0,
      responseTimeSum: 0,
      responseTimeCount: 0,
      endpointHits: new Map(),
      timestamp: Date.now(),
    };
  }

  getDashboardData() {
    const current = this.getCurrentMetrics();
    const history = this.getMetricsHistory();

    const cacheHitRatio = current.cacheHits + current.cacheMisses > 0
      ? current.cacheHits / (current.cacheHits + current.cacheMisses)
      : 0;
    const avgResponseTime = current.responseTimeCount > 0
      ? current.responseTimeSum / current.responseTimeCount
      : 0;

    // Get top 10 endpoints by hits
    const topEndpoints = Array.from(current.endpointHits.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([endpoint, hits]) => ({ endpoint, hits }));

    // Prepare time series data for charts
    const timeSeriesData = history.map((data, index) => ({
      timestamp: data.timestamp,
      requests: data.totalRequests,
      cacheHits: data.cacheHits,
      cacheMisses: data.cacheMisses,
      rateLimitBlocks: data.rateLimitBlocks,
      avgResponseTime: data.responseTimeCount > 0 ? data.responseTimeSum / data.responseTimeCount : 0,
    }));

    return {
      current: {
        cacheHits: current.cacheHits,
        cacheMisses: current.cacheMisses,
        cacheHitRatio,
        rateLimitBlocks: current.rateLimitBlocks,
        totalRequests: current.totalRequests,
        avgResponseTime,
        topEndpoints,
      },
      history: timeSeriesData,
    };
  }
}

// Global metrics collector instance
export const metricsCollector = new MetricsCollector();

// Auto-snapshot every 60 seconds
setInterval(() => {
  metricsCollector.snapshot();
}, 60000);
