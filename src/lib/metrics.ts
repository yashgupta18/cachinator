export interface MetricsData {
  cacheHits: number;
  cacheMisses: number;
  rateLimitBlocks: number;
  totalRequests: number;
  responseTimeSum: number;
  responseTimeCount: number;
  responseTimeBuckets: Map<string, number>; // bucket -> count
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
    responseTimeBuckets: new Map(),
    endpointHits: new Map(),
    timestamp: Date.now(),
  };

  // Histogram buckets for response time (in seconds)
  private readonly responseTimeBuckets = [
    0.001,  // 1ms
    0.005,  // 5ms
    0.01,   // 10ms
    0.025,  // 25ms
    0.05,   // 50ms
    0.1,    // 100ms
    0.25,   // 250ms
    0.5,    // 500ms
    1.0,    // 1s
    2.5,    // 2.5s
    5.0,    // 5s
    10.0,   // 10s
    Number.POSITIVE_INFINITY, // +Inf
  ];

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

    // Record response time in histogram buckets
    this.recordResponseTimeBucket(responseTime);

    const currentHits = this.metrics.endpointHits.get(endpoint) || 0;
    this.metrics.endpointHits.set(endpoint, currentHits + 1);
  }

  private recordResponseTimeBucket(responseTimeMs: number): void {
    const responseTimeSeconds = responseTimeMs / 1000;

    // Find the appropriate bucket for this response time
    for (let i = 0; i < this.responseTimeBuckets.length; i++) {
      const bucket = this.responseTimeBuckets[i];
      const bucketKey = bucket === Number.POSITIVE_INFINITY ? '+Inf' : bucket.toString();

      if (responseTimeSeconds <= bucket) {
        const currentCount = this.metrics.responseTimeBuckets.get(bucketKey) || 0;
        this.metrics.responseTimeBuckets.set(bucketKey, currentCount + 1);
        break;
      }
    }
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

# HELP cachinator_response_time_seconds Response time histogram
# TYPE cachinator_response_time_seconds histogram
cachinator_response_time_seconds_bucket{le="0.001"} ${current.responseTimeBuckets.get('0.001') || 0}
cachinator_response_time_seconds_bucket{le="0.005"} ${current.responseTimeBuckets.get('0.005') || 0}
cachinator_response_time_seconds_bucket{le="0.01"} ${current.responseTimeBuckets.get('0.01') || 0}
cachinator_response_time_seconds_bucket{le="0.025"} ${current.responseTimeBuckets.get('0.025') || 0}
cachinator_response_time_seconds_bucket{le="0.05"} ${current.responseTimeBuckets.get('0.05') || 0}
cachinator_response_time_seconds_bucket{le="0.1"} ${current.responseTimeBuckets.get('0.1') || 0}
cachinator_response_time_seconds_bucket{le="0.25"} ${current.responseTimeBuckets.get('0.25') || 0}
cachinator_response_time_seconds_bucket{le="0.5"} ${current.responseTimeBuckets.get('0.5') || 0}
cachinator_response_time_seconds_bucket{le="1.0"} ${current.responseTimeBuckets.get('1.0') || 0}
cachinator_response_time_seconds_bucket{le="2.5"} ${current.responseTimeBuckets.get('2.5') || 0}
cachinator_response_time_seconds_bucket{le="5.0"} ${current.responseTimeBuckets.get('5.0') || 0}
cachinator_response_time_seconds_bucket{le="10.0"} ${current.responseTimeBuckets.get('10.0') || 0}
cachinator_response_time_seconds_bucket{le="+Inf"} ${current.responseTimeBuckets.get('+Inf') || 0}
cachinator_response_time_seconds_sum ${current.responseTimeSum / 1000}
cachinator_response_time_seconds_count ${current.responseTimeCount}

# HELP cachinator_response_time_seconds_avg Average response time in seconds (for backward compatibility)
# TYPE cachinator_response_time_seconds_avg gauge
cachinator_response_time_seconds_avg ${avgResponseTime / 1000}

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
      responseTimeBuckets: new Map(),
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
        responseTimeBuckets: current.responseTimeBuckets,
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
