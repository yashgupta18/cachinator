#!/usr/bin/env node

/**
 * Test script to demonstrate Cachinator monitoring features
 * Run this after starting the example server with: npm run dev
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

// Helper function to make HTTP requests
function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const requestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Cachinator-Test-Script/1.0',
        'Accept-Encoding': 'gzip, br',
        ...options.headers,
      },
    };

    const req = http.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

// Test functions
async function testBasicEndpoints() {
  console.log('🧪 Testing basic endpoints...');

  try {
    // Test cached endpoint
    const timeResponse = await makeRequest('/time');
    console.log(
      `✅ GET /time - Status: ${timeResponse.statusCode}, Cache: ${timeResponse.headers['x-cache']}`,
    );

    // Test another cached endpoint
    const helloResponse = await makeRequest('/hello');
    console.log(
      `✅ GET /hello - Status: ${helloResponse.statusCode}, Cache: ${helloResponse.headers['x-cache']}`,
    );

    // Test API endpoints
    const usersResponse = await makeRequest('/api/users');
    console.log(
      `✅ GET /api/users - Status: ${usersResponse.statusCode}, Cache: ${usersResponse.headers['x-cache']}`,
    );

    const postsResponse = await makeRequest('/api/posts');
    console.log(
      `✅ GET /api/posts - Status: ${postsResponse.statusCode}, Cache: ${postsResponse.headers['x-cache']}`,
    );
  } catch (error) {
    console.error('❌ Error testing basic endpoints:', error.message);
  }
}

async function testCacheBehavior() {
  console.log('\n🧪 Testing cache behavior...');

  try {
    // First request (should be cache miss)
    const firstResponse = await makeRequest('/time');
    console.log(`🔄 First request - Cache: ${firstResponse.headers['x-cache']}`);

    // Second request (should be cache hit)
    const secondResponse = await makeRequest('/time');
    console.log(`🔄 Second request - Cache: ${secondResponse.headers['x-cache']}`);

    // Test cache invalidation
    console.log('🗑️  Testing cache invalidation...');
    const invalidateResponse = await makeRequest('/time', { method: 'POST' });
    console.log(`✅ POST /time - Status: ${invalidateResponse.statusCode}`);

    // Request after invalidation (should be cache miss again)
    const afterInvalidateResponse = await makeRequest('/time');
    console.log(`🔄 After invalidation - Cache: ${afterInvalidateResponse.headers['x-cache']}`);
  } catch (error) {
    console.error('❌ Error testing cache behavior:', error.message);
  }
}

async function testRateLimiting() {
  console.log('\n🧪 Testing rate limiting...');

  try {
    // Make multiple requests to trigger rate limiting
    const requests = [];
    for (let i = 0; i < 15; i++) {
      requests.push(
        makeRequest('/time', {
          headers: {
            'x-api-key': 'test-key-123',
          },
        }),
      );
    }

    const responses = await Promise.all(requests);
    const successCount = responses.filter((r) => r.statusCode === 200).length;
    const rateLimitedCount = responses.filter((r) => r.statusCode === 429).length;

    console.log(`✅ Made 15 requests with same API key`);
    console.log(`   Successful: ${successCount}`);
    console.log(`   Rate limited: ${rateLimitedCount}`);

    // Test with different API key (should not be rate limited)
    const differentKeyResponse = await makeRequest('/time', {
      headers: {
        'x-api-key': 'different-key-456',
      },
    });
    console.log(`✅ Different API key - Status: ${differentKeyResponse.statusCode}`);
  } catch (error) {
    console.error('❌ Error testing rate limiting:', error.message);
  }
}

async function testMonitoringEndpoints() {
  console.log('\n🧪 Testing monitoring endpoints...');

  try {
    // Test Prometheus metrics
    const metricsResponse = await makeRequest('/metrics');
    console.log(`✅ GET /metrics - Status: ${metricsResponse.statusCode}`);
    console.log(`   Response length: ${metricsResponse.body.length} characters`);

    // Test dashboard
    const dashboardResponse = await makeRequest('/express-guard/dashboard');
    console.log(`✅ GET /express-guard/dashboard - Status: ${dashboardResponse.statusCode}`);
    console.log(`   Response length: ${dashboardResponse.body.length} characters`);

    // Test dashboard data API
    const dashboardDataResponse = await makeRequest('/express-guard/dashboard/data');
    console.log(
      `✅ GET /express-guard/dashboard/data - Status: ${dashboardDataResponse.statusCode}`,
    );

    const dashboardData = JSON.parse(dashboardDataResponse.body);
    console.log(`   Current metrics:`);
    console.log(`     Total requests: ${dashboardData.current.totalRequests}`);
    console.log(`     Cache hits: ${dashboardData.current.cacheHits}`);
    console.log(`     Cache misses: ${dashboardData.current.cacheMisses}`);
    console.log(`     Cache hit ratio: ${(dashboardData.current.cacheHitRatio * 100).toFixed(1)}%`);
    console.log(`     Rate limit blocks: ${dashboardData.current.rateLimitBlocks}`);
    console.log(`     Avg response time: ${dashboardData.current.avgResponseTime.toFixed(0)}ms`);
  } catch (error) {
    console.error('❌ Error testing monitoring endpoints:', error.message);
  }
}

async function runLoadTest() {
  console.log('\n🧪 Running load test to generate metrics...');

  try {
    const endpoints = ['/time', '/hello', '/api/users', '/api/posts', '/large'];
    const requests = [];

    // Generate 50 random requests
    for (let i = 0; i < 50; i++) {
      const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
      const apiKey = Math.random() > 0.5 ? 'load-test-key-1' : 'load-test-key-2';

      requests.push(
        makeRequest(endpoint, {
          headers: {
            'x-api-key': apiKey,
          },
        }),
      );
    }

    const responses = await Promise.all(requests);
    const successCount = responses.filter((r) => r.statusCode === 200).length;
    const rateLimitedCount = responses.filter((r) => r.statusCode === 429).length;

    console.log(`✅ Load test completed`);
    console.log(`   Total requests: ${responses.length}`);
    console.log(`   Successful: ${successCount}`);
    console.log(`   Rate limited: ${rateLimitedCount}`);
  } catch (error) {
    console.error('❌ Error running load test:', error.message);
  }
}

// Main execution
async function main() {
  console.log('🚀 Cachinator Monitoring Test Script');
  console.log('=====================================\n');

  console.log('Make sure the example server is running with: npm run dev\n');

  await testBasicEndpoints();
  await testCacheBehavior();
  await testRateLimiting();
  await testMonitoringEndpoints();
  await runLoadTest();

  console.log('\n🎉 Test completed!');
  console.log('\n📊 Check the dashboard at: http://localhost:3000/express-guard/dashboard');
  console.log('📈 Check metrics at: http://localhost:3000/metrics');
  console.log('\nThe dashboard should now show live metrics from the test requests!');
}

// Run the tests
main().catch(console.error);
