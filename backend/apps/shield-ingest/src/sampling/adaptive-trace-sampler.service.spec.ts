import { Test, TestingModule } from '@nestjs/testing';
import {
  AdaptiveTraceSamplerService,
  TelemetrySpan,
} from './adaptive-trace-sampler.service';

describe('AdaptiveTraceSamplerService', () => {
  let service: AdaptiveTraceSamplerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdaptiveTraceSamplerService],
    }).compile();

    service = module.get<AdaptiveTraceSamplerService>(
      AdaptiveTraceSamplerService,
    );
  });

  it('should retain 100% of spans containing matched Threat IOCs', () => {
    const span: TelemetrySpan = {
      traceId: 'trace-c001',
      spanId: 'span-001',
      tenantId: 'tenant-bank-1',
      serviceName: 'auth-service',
      operationName: 'login',
      durationMs: 45,
      hasError: false,
      matchedIoc: true,
      timestamp: new Date().toISOString(),
    };

    const decision = service.sampleSpan(span);
    expect(decision.retained).toBe(true);
    expect(decision.reason).toBe('RETAIN_THREAT_IOC');
    expect(decision.appliedSampleRate).toBe(1.0);
  });

  it('should retain 100% of spans with errors or HTTP 500', () => {
    const errorSpan: TelemetrySpan = {
      traceId: 'trace-e500',
      spanId: 'span-002',
      tenantId: 'tenant-bank-1',
      serviceName: 'payment-gateway',
      operationName: 'processPayment',
      durationMs: 1200,
      hasError: true,
      httpStatusCode: 502,
      timestamp: new Date().toISOString(),
    };

    const decision = service.sampleSpan(errorSpan);
    expect(decision.retained).toBe(true);
    expect(decision.reason).toBe('RETAIN_ERROR');
  });

  it('should dynamically throttle normal spans under elevated queue pressure', () => {
    service.setQueuePressure(0.9); // Heavy backpressure
    expect(service.getEffectiveSampleRate()).toBe(0.01);

    service.setQueuePressure(0.2); // Normal
    expect(service.getEffectiveSampleRate()).toBe(0.05);
  });
});
