import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { SloMetricsExporterService } from './slo-metrics-exporter.service';
import { TelemetryTracingInterceptor } from './telemetry-tracing.interceptor';

describe('SloMetricsExporterService & Distributed Tracing (LAB 16 Observability)', () => {
  let sloExporter: SloMetricsExporterService;
  let tracingInterceptor: TelemetryTracingInterceptor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SloMetricsExporterService, TelemetryTracingInterceptor],
    }).compile();

    sloExporter = module.get<SloMetricsExporterService>(
      SloMetricsExporterService,
    );
    tracingInterceptor = module.get<TelemetryTracingInterceptor>(
      TelemetryTracingInterceptor,
    );
  });

  describe('PromQL SLO Metrics Exporter', () => {
    it('should generate compliant PromQL metrics and SHA-256 attestation digest', () => {
      const snapshot = sloExporter.generateSloMetricsSnapshot(
        'tenant-bank-01',
        {
          ingestion: {
            tenantId: 'tenant-bank-01',
            acceptanceRatePercentage: 99.98,
            lagMs: 142,
            normalizationSuccessPercentage: 100,
            quarantineCount: 0,
            connectorState: 'HEALTHY',
          },
          detection: {
            tenantId: 'tenant-bank-01',
            p99LatencyMs: 412,
            replayDeterminismPercentage: 100,
            falsePositiveReviewRate: 0.02,
            stateStoreHealth: 'OPTIMAL',
          },
          caseResponse: {
            tenantId: 'tenant-bank-01',
            alertToTriageAvgSeconds: 12,
            caseAgeHours: 0.5,
            approvalLatencySeconds: 15,
            executedActionsCount: 4,
            rollbackActionsCount: 0,
          },
          evidence: {
            tenantId: 'tenant-bank-01',
            freshnessSeconds: 18,
            completenessPercentage: 100,
            ledgerVerifiedCount: 88,
            anchorPublicationLatencyMs: 250,
          },
          aiGateway: {
            tenantId: 'tenant-bank-01',
            modelVersion: 'vertex-gemini-1.5-pro',
            avgGroundingScore: 0.985,
            citationValidityPercentage: 100,
            blockedVerdictsCount: 0,
            totalTokensUsed: 15200,
            tenantAttributableCostUsd: 0.0456,
          },
        },
      );

      expect(snapshot.snapshotId).toBeDefined();
      expect(snapshot.promQlFormattedMetrics.length).toBeGreaterThanOrEqual(7);
      expect(snapshot.promQlFormattedMetrics).toContain(
        'zoikoshield_ingest_acceptance_rate{tenant_id="tenant-bank-01",connector_state="HEALTHY"} 99.98',
      );
      expect(snapshot.promQlFormattedMetrics).toContain(
        'zoikoshield_ingest_lag_ms{tenant_id="tenant-bank-01"} 142',
      );
      expect(snapshot.promQlFormattedMetrics).toContain(
        'zoikoshield_detection_p99_latency_ms{tenant_id="tenant-bank-01"} 412',
      );
      expect(snapshot.attestationDigest).toHaveLength(64);
    });
  });

  describe('W3C Distributed Tracing Interceptor', () => {
    it('should generate a new W3C traceparent context when no incoming header is present', () => {
      const context = tracingInterceptor.parseOrCreateTraceContext();

      expect(context.traceId).toHaveLength(32);
      expect(context.spanId).toHaveLength(16);
      expect(context.traceFlags).toBe('01');
      expect(context.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    });

    it('should propagate incoming W3C traceparent and issue a new child span ID', () => {
      const incoming =
        '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
      const context = tracingInterceptor.parseOrCreateTraceContext(incoming);

      expect(context.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
      expect(context.parentSpanId).toBe('00f067aa0ba902b7');
      expect(context.spanId).not.toBe('00f067aa0ba902b7');
      expect(context.traceparent).toMatch(
        /^00-4bf92f3577b34da6a3ce929d0e0e4736-[0-9a-f]{16}-01$/,
      );
    });

    it('should intercept execution and set traceparent header on response', (done) => {
      const mockReq = { headers: {} };
      const setHeaderSpy = jest.fn();
      const mockRes = { setHeader: setHeaderSpy };

      const mockExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => mockReq,
          getResponse: () => mockRes,
        }),
      } as unknown as ExecutionContext;

      const mockCallHandler: CallHandler = {
        handle: () => of({ success: true }),
      };

      tracingInterceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe({
          next: (val) => {
            expect(val).toEqual({ success: true });
            expect(setHeaderSpy).toHaveBeenCalledWith(
              'traceparent',
              expect.stringMatching(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/),
            );
            done();
          },
        });
    });
  });
});
