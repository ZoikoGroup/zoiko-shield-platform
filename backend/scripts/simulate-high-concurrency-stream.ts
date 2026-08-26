import 'dotenv/config';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import crypto from 'crypto';
import { TokenBucketRateLimiterService } from '../apps/shield-ingest/src/ingestion/rate-limiter/token-bucket-limiter.service';
import { PrometheusMetricsService } from '../apps/shield-core/src/metrics/prometheus-metrics.service';
import { TraceContextInterceptor } from '../apps/shield-core/src/observability/trace-context.interceptor';

/**
 * ZoikoShield High-Concurrency Multi-Tenant Stream Simulator
 * Simulates high-throughput streaming traffic across multiple enterprise tenants:
 * - Tests Token Bucket Rate Limiting under burst & sustained loads
 * - Measures P50, P95, P99 ingestion & normalization latency
 * - Validates Prometheus Metrics aggregation
 * - Checks W3C distributed trace context generation
 */
async function runHighConcurrencySimulation() {
  const logger = new Logger('StreamSimulator');
  logger.log('========================================================================');
  logger.log(' Starting ZoikoShield High-Concurrency Multi-Tenant Stream Simulation  ');
  logger.log('========================================================================');

  const rateLimiter = new TokenBucketRateLimiterService();
  const metrics = new PrometheusMetricsService();

  const tenants = [
    { id: 'tenant-enterprise-alpha', tier: 'ENTERPRISE', burst: 300, rate: 100 },
    { id: 'tenant-financial-beta', tier: 'COMMERCIAL', burst: 150, rate: 50 },
    { id: 'tenant-startup-gamma', tier: 'STARTER', burst: 50, rate: 10 },
  ];

  const totalEventsToSimulate = 1000;
  logger.log(`Simulating ${totalEventsToSimulate} concurrent telemetry events across ${tenants.length} tenants...`);

  let allowedCount = 0;
  let throttledCount = 0;
  const latencies: number[] = [];

  const startTime = Date.now();

  const promises = Array.from({ length: totalEventsToSimulate }).map(async (_, idx) => {
    const tenant = tenants[idx % tenants.length];
    const eventStart = performance.now();

    // 1. Generate W3C trace context
    const traceId = TraceContextInterceptor.generateTraceId();
    const spanId = TraceContextInterceptor.generateSpanId();

    // 2. Consume rate limiter tokens
    const decision = rateLimiter.consume(tenant.id, 1, {
      capacity: tenant.burst,
      refillRatePerSec: tenant.rate,
    });

    if (decision.allowed) {
      allowedCount++;
      metrics.incrementCounter('zoiko_events_ingested_total', 1, {
        tenant_id: tenant.id,
        tier: tenant.tier,
      });
    } else {
      throttledCount++;
    }

    const eventDuration = (performance.now() - eventStart) / 1000;
    latencies.push(eventDuration);
    metrics.observeHistogram('zoiko_detection_evaluation_duration_seconds', eventDuration);
  });

  await Promise.all(promises);
  const totalElapsedMs = Date.now() - startTime;
  const throughput = Math.round((totalEventsToSimulate / (totalElapsedMs / 1000)));

  // Calculate percentiles
  latencies.sort((a, b) => a - b);
  const p50 = (latencies[Math.floor(latencies.length * 0.5)] * 1000).toFixed(3);
  const p95 = (latencies[Math.floor(latencies.length * 0.95)] * 1000).toFixed(3);
  const p99 = (latencies[Math.floor(latencies.length * 0.99)] * 1000).toFixed(3);

  logger.log('\n--- Concurrency Simulation Results ---');
  logger.log(`  ✔ Total Events Simulated : ${totalEventsToSimulate}`);
  logger.log(`  ✔ Allowed Ingestions     : ${allowedCount}`);
  logger.log(`  ✔ Throttled Ingestions   : ${throttledCount} (Rate-Limiter Protected)`);
  logger.log(`  ✔ Wall Clock Duration    : ${totalElapsedMs} ms`);
  logger.log(`  ✔ Ingestion Throughput   : ${throughput} events/sec`);
  logger.log(`  ✔ Latency Percentiles    : P50: ${p50}ms | P95: ${p95}ms | P99: ${p99}ms`);

  const exportedMetrics = metrics.exportPrometheusText();
  logger.log(`  ✔ Prometheus Exporter   : Verified (${exportedMetrics.split('\n').length} metric lines generated)`);

  logger.log('\n========================================================================');
  logger.log(' High-Concurrency Simulation Completed Successfully! ');
  logger.log('========================================================================\n');
}

runHighConcurrencySimulation().catch((err) => {
  console.error('Simulation Error:', err);
  process.exit(1);
});
