import { Test, TestingModule } from '@nestjs/testing';
import {
  CompositeCorrelationService,
  OcsfCorrelationEvent,
} from './composite-correlation.service';

describe('CompositeCorrelationService', () => {
  let service: CompositeCorrelationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CompositeCorrelationService],
    }).compile();

    service = module.get<CompositeCorrelationService>(CompositeCorrelationService);
    service.clearState();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should detect full 3-stage ransomware killchain on the same target host', async () => {
    const tenantId = 'tenant-test-01';
    const targetHost = 'srv-prod-db-01';
    const now = new Date();

    // Stage 1: Authentication / Lateral Movement
    const stage1: OcsfCorrelationEvent = {
      eventId: 'evt-001',
      tenantId,
      classUid: 1001,
      categoryName: 'AUTHENTICATION',
      activityName: 'LOGIN_ATTEMPT',
      severity: 'LOW',
      timestamp: new Date(now.getTime() - 60000),
      targetHost,
      actor: 'compromised.user@acme.corp',
    };

    const res1 = await service.processEvent(stage1);
    expect(res1).toBeNull();

    // Stage 2: Obfuscated PowerShell execution
    const stage2: OcsfCorrelationEvent = {
      eventId: 'evt-002',
      tenantId,
      classUid: 1007,
      categoryName: 'PROCESS_ACTIVITY',
      activityName: 'PROCESS_LAUNCH',
      severity: 'HIGH',
      timestamp: new Date(now.getTime() - 30000),
      targetHost,
      rawPayload: { commandLine: 'powershell.exe -Enc SGVsbG8= -WindowStyle Hidden' },
    };

    const res2 = await service.processEvent(stage2);
    expect(res2).toBeNull();

    // Stage 3: Volume Shadow Copy Deletion (VSS Deletion)
    const stage3: OcsfCorrelationEvent = {
      eventId: 'evt-003',
      tenantId,
      classUid: 1007,
      categoryName: 'PROCESS_ACTIVITY',
      activityName: 'PROCESS_LAUNCH',
      severity: 'CRITICAL',
      timestamp: now,
      targetHost,
      rawPayload: { commandLine: 'vssadmin.exe delete shadows /all /quiet' },
    };

    const res3 = await service.processEvent(stage3);
    expect(res3).not.toBeNull();
    expect(res3?.patternId).toBe('ZS-CORR-RANSOMWARE-001');
    expect(res3?.severity).toBe('CRITICAL');
    expect(res3?.confidence).toBeGreaterThanOrEqual(0.95);
    expect(res3?.matchedEventIds).toEqual(['evt-001', 'evt-002', 'evt-003']);
    expect(res3?.stagesMatched.length).toBe(3);
  });

  it('should maintain strict multi-tenant boundary and not correlate across different tenants', async () => {
    const targetHost = 'shared-hostname-01';

    // Tenant A Stage 1
    await service.processEvent({
      eventId: 'evt-tenant-a-01',
      tenantId: 'tenant-a',
      classUid: 1001,
      categoryName: 'AUTHENTICATION',
      activityName: 'LOGIN_ATTEMPT',
      severity: 'LOW',
      timestamp: new Date(),
      targetHost,
    });

    // Tenant B Stage 2 & 3
    await service.processEvent({
      eventId: 'evt-tenant-b-02',
      tenantId: 'tenant-b',
      classUid: 1007,
      categoryName: 'PROCESS_ACTIVITY',
      activityName: 'PROCESS_LAUNCH',
      severity: 'HIGH',
      timestamp: new Date(),
      targetHost,
      rawPayload: { commandLine: 'powershell.exe -Enc Zm9v' },
    });

    const resB3 = await service.processEvent({
      eventId: 'evt-tenant-b-03',
      tenantId: 'tenant-b',
      classUid: 1007,
      categoryName: 'PROCESS_ACTIVITY',
      activityName: 'PROCESS_LAUNCH',
      severity: 'CRITICAL',
      timestamp: new Date(),
      targetHost,
      rawPayload: { commandLine: 'vssadmin delete shadows' },
    });

    // Tenant B only has 2 stages, so no composite match
    expect(resB3).toBeNull();
  });

  it('should detect Cloud IAM Privilege Escalation pattern', async () => {
    const tenantId = 'tenant-cloud-01';
    const actor = 'cloud.admin.service';

    // Stage 1: PutUserPolicy
    await service.processEvent({
      eventId: 'evt-cloud-01',
      tenantId,
      classUid: 3002,
      categoryName: 'IAM_POLICY_CHANGE',
      activityName: 'PUT_USER_POLICY',
      severity: 'HIGH',
      timestamp: new Date(),
      actor,
    });

    // Stage 2: Secret retrieval
    const res = await service.processEvent({
      eventId: 'evt-cloud-02',
      tenantId,
      classUid: 6003,
      categoryName: 'API_ACTIVITY',
      activityName: 'GET_SECRET_VALUE',
      severity: 'CRITICAL',
      timestamp: new Date(),
      actor,
    });

    expect(res).not.toBeNull();
    expect(res?.patternId).toBe('ZS-CORR-CLOUD-PRIV-002');
    expect(res?.matchedEventIds).toEqual(['evt-cloud-01', 'evt-cloud-02']);
  });

  it('should detect eBPF Kernel Container Escape pattern', async () => {
    const tenantId = 'tenant-k8s-01';
    const targetHost = 'k8s-node-worker-09';
    const now = new Date();

    // Stage 1: eBPF Container Escape
    await service.processEvent({
      eventId: 'evt-ebpf-esc-01',
      tenantId,
      classUid: 2001,
      categoryName: 'CONTAINER_RUNTIME',
      activityName: 'CONTAINER_ESCAPE_FINDING',
      severity: 'CRITICAL',
      timestamp: new Date(now.getTime() - 40000),
      targetHost,
      rawPayload: { rule: 'EBPF-RULE-CONTAINER-ESCAPE-DETECTED', capability: 'SYS_ADMIN' },
    });

    // Stage 2: Root process execution
    await service.processEvent({
      eventId: 'evt-ebpf-esc-02',
      tenantId,
      classUid: 4001,
      categoryName: 'PROCESS_ACTIVITY',
      activityName: 'PROCESS_EXEC',
      severity: 'CRITICAL',
      timestamp: new Date(now.getTime() - 20000),
      targetHost,
      rawPayload: { binary: '/bin/bash', user: 'root', syscall: 'execve' },
    });

    // Stage 3: Outbound C2 connect
    const res = await service.processEvent({
      eventId: 'evt-ebpf-esc-03',
      tenantId,
      classUid: 4002,
      categoryName: 'NETWORK_ACTIVITY',
      activityName: 'OUTBOUND_CONNECT',
      severity: 'HIGH',
      timestamp: now,
      targetHost,
      rawPayload: { destinationIp: '198.51.100.99', destinationPort: 4444 },
    });

    expect(res).not.toBeNull();
    expect(res?.patternId).toBe('ZS-CORR-CONTAINER-ESCAPE-003');
    expect(res?.severity).toBe('CRITICAL');
    expect(res?.matchedEventIds).toEqual(['evt-ebpf-esc-01', 'evt-ebpf-esc-02', 'evt-ebpf-esc-03']);
  });
});
