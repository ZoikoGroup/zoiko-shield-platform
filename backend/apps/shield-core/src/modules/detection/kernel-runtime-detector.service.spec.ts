import { Test, TestingModule } from '@nestjs/testing';
import {
  KernelRuntimeDetectorService,
  KernelTelemetryEvent,
} from './kernel-runtime-detector.service';

describe('KernelRuntimeDetectorService', () => {
  let service: KernelRuntimeDetectorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KernelRuntimeDetectorService],
    }).compile();

    service = module.get<KernelRuntimeDetectorService>(
      KernelRuntimeDetectorService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should detect CRITICAL container escape runtime anomaly', () => {
    const event: KernelTelemetryEvent = {
      eventId: 'evt-kernel-01',
      tenantId: 'tenant-enterprise-01',
      sourceSensor: 'TETRAGON_PROBE',
      k8sNamespace: 'production',
      k8sPodName: 'payment-gateway-7d84f8',
      hostPid: 1042,
      containerPid: 1,
      binaryPath: '/bin/nsenter',
      syscallName: 'setns',
      eventType: 'KUBERNETES_CONTAINER_ESCAPE',
      details: { targetNs: 'mnt', flags: 'CLONE_NEWNS' },
      observedAt: new Date().toISOString(),
    };

    const finding = service.analyzeKernelEvent(event);
    expect(finding.threatDetected).toBe(true);
    expect(finding.severity).toBe('CRITICAL');
    expect(finding.confidenceScore).toBeGreaterThanOrEqual(0.98);
    expect(finding.mitigationRecommendation).toContain('isolate host node');
  });

  it('should detect HIGH severity memory fileless execution anomaly', () => {
    const event: KernelTelemetryEvent = {
      eventId: 'evt-kernel-02',
      tenantId: 'tenant-enterprise-01',
      sourceSensor: 'FALCO_SENSOR',
      k8sNamespace: 'backend',
      k8sPodName: 'auth-svc-9c321',
      hostPid: 3412,
      containerPid: 42,
      binaryPath: 'memfd:payload (deleted)',
      syscallName: 'execveat',
      eventType: 'EXEC_FROM_MEMFD_ANONYMOUS',
      details: { fd: 3 },
      observedAt: new Date().toISOString(),
    };

    const finding = service.analyzeKernelEvent(event);
    expect(finding.threatDetected).toBe(true);
    expect(finding.severity).toBe('HIGH');
    expect(finding.mitigationRecommendation).toContain('memory');
  });
});
