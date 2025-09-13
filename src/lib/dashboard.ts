import { Request, Response, NextFunction } from 'express';
import { metricsCollector } from './metrics';

export interface DashboardOptions {
  path?: string;
  title?: string;
  refreshInterval?: number; // seconds
}

export function createDashboard(options: DashboardOptions = {}) {
  const {
    path = '/express-guard/dashboard',
    title = 'Cachinator Dashboard',
    refreshInterval = 5,
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === path) {
      const dashboardData = metricsCollector.getDashboardData();

      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            color: #333;
        }

        .header {
            background: #2c3e50;
            color: white;
            padding: 1rem 2rem;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .header h1 {
            font-size: 1.5rem;
            font-weight: 600;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }

        .stat-card {
            background: white;
            padding: 1.5rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            text-align: center;
        }

        .stat-value {
            font-size: 2rem;
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 0.5rem;
        }

        .stat-label {
            color: #666;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .charts-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2rem;
            margin-bottom: 2rem;
        }

        .chart-container {
            background: white;
            padding: 1.5rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            height: 300px;
            position: relative;
        }

        .chart-title {
            font-size: 1.1rem;
            font-weight: 600;
            margin-bottom: 1rem;
            color: #2c3e50;
        }

        .endpoints-table {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            overflow: hidden;
        }

        .table-header {
            background: #f8f9fa;
            padding: 1rem 1.5rem;
            font-weight: 600;
            color: #2c3e50;
            border-bottom: 1px solid #dee2e6;
        }

        .table-row {
            padding: 1rem 1.5rem;
            border-bottom: 1px solid #dee2e6;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .table-row:last-child {
            border-bottom: none;
        }

        .endpoint {
            font-family: monospace;
            color: #495057;
        }

        .hits {
            font-weight: 600;
            color: #2c3e50;
        }

        .refresh-info {
            text-align: center;
            color: #666;
            font-size: 0.9rem;
            margin-top: 2rem;
        }

        @media (max-width: 768px) {
            .charts-grid {
                grid-template-columns: 1fr;
            }

            .container {
                padding: 1rem;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${title}</h1>
    </div>

    <div class="container">
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value" id="total-requests">${dashboardData.current.totalRequests}</div>
                <div class="stat-label">Total Requests</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="cache-hits">${dashboardData.current.cacheHits}</div>
                <div class="stat-label">Cache Hits</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="cache-misses">${dashboardData.current.cacheMisses}</div>
                <div class="stat-label">Cache Misses</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="cache-hit-ratio">${(dashboardData.current.cacheHitRatio * 100).toFixed(1)}%</div>
                <div class="stat-label">Cache Hit Ratio</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="rate-limit-blocks">${dashboardData.current.rateLimitBlocks}</div>
                <div class="stat-label">Rate Limit Blocks</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="avg-response-time">${dashboardData.current.avgResponseTime.toFixed(0)}ms</div>
                <div class="stat-label">Avg Response Time</div>
            </div>
        </div>

        <div class="charts-grid">
            <div class="chart-container">
                <div class="chart-title">Requests Over Time</div>
                <canvas id="requests-chart"></canvas>
            </div>
            <div class="chart-container">
                <div class="chart-title">Cache Hit Ratio</div>
                <canvas id="cache-ratio-chart"></canvas>
            </div>
        </div>

        <div class="endpoints-table">
            <div class="table-header">Top Endpoints by Hits</div>
            <div id="endpoints-list">
                ${dashboardData.current.topEndpoints.map(endpoint =>
                  `<div class="table-row">
                    <div class="endpoint">${endpoint.endpoint}</div>
                    <div class="hits">${endpoint.hits}</div>
                  </div>`
                ).join('')}
            </div>
        </div>

        <div class="refresh-info">
            Auto-refreshing every ${refreshInterval} seconds
        </div>
    </div>

    <script>
        // Chart.js configuration
        Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        Chart.defaults.color = '#666';

        const historyData = ${JSON.stringify(dashboardData.history)};

        // Requests over time chart
        const requestsCtx = document.getElementById('requests-chart').getContext('2d');
        new Chart(requestsCtx, {
            type: 'line',
            data: {
                labels: historyData.map(d => new Date(d.timestamp).toLocaleTimeString()),
                datasets: [{
                    label: 'Requests',
                    data: historyData.map(d => d.requests),
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                scales: {
                    x: {
                        display: true,
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0,0,0,0.1)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        borderColor: '#3498db',
                        borderWidth: 1
                    }
                }
            }
        });

        // Cache hit ratio chart
        const cacheRatioCtx = document.getElementById('cache-ratio-chart').getContext('2d');
        new Chart(cacheRatioCtx, {
            type: 'doughnut',
            data: {
                labels: ['Cache Hits', 'Cache Misses'],
                datasets: [{
                    data: [${dashboardData.current.cacheHits}, ${dashboardData.current.cacheMisses}],
                    backgroundColor: ['#27ae60', '#e74c3c'],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return context.label + ': ' + context.parsed + ' (' + percentage + '%)';
                            }
                        }
                    }
                }
            }
        });

        // Auto-refresh functionality
        setInterval(() => {
            fetch('${path}/data')
                .then(response => response.json())
                .then(data => {
                    document.getElementById('total-requests').textContent = data.current.totalRequests;
                    document.getElementById('cache-hits').textContent = data.current.cacheHits;
                    document.getElementById('cache-misses').textContent = data.current.cacheMisses;
                    document.getElementById('cache-hit-ratio').textContent = (data.current.cacheHitRatio * 100).toFixed(1) + '%';
                    document.getElementById('rate-limit-blocks').textContent = data.current.rateLimitBlocks;
                    document.getElementById('avg-response-time').textContent = data.current.avgResponseTime.toFixed(0) + 'ms';

                    // Update endpoints list
                    const endpointsList = document.getElementById('endpoints-list');
                    endpointsList.innerHTML = data.current.topEndpoints.map(endpoint =>
                        \`<div class="table-row">
                            <div class="endpoint">\${endpoint.endpoint}</div>
                            <div class="hits">\${endpoint.hits}</div>
                        </div>\`
                    ).join('');
                })
                .catch(error => console.error('Failed to refresh data:', error));
        }, ${refreshInterval * 1000});
    </script>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html');
      res.send(html);
      return;
    }

    // API endpoint for dashboard data
    if (req.path === `${path}/data`) {
      const dashboardData = metricsCollector.getDashboardData();
      res.json(dashboardData);
      return;
    }

    next();
  };
}
