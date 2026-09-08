import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { CommandCenterBffService } from './command-center-bff.service';

describe('CommandCenterBffService (LAB 14 Experience State Contracts)', () => {
  let service: CommandCenterBffService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommandCenterBffService],
    }).compile();

    service = module.get<CommandCenterBffService>(CommandCenterBffService);
  });

  it('1. should return HEALTHY_SYNCED state for active tenant with fresh telemetry (< 60s)', async () => {
    const tenantId = 'tenant-bank-alpha';
    service.setTenantTelemetryState(tenantId, {
      lastTelemetryTime: Date.now() - 15000, // 15 seconds ago
      isDegraded: false,
    });

    const envelope = await service.getOverview(tenantId, 'corr-001');

    expect(envelope.status).toBe('HEALTHY_SYNCED');
    expect(envelope.isStale).toBe(false);
    expect(envelope.isPartial).toBe(false);
    expect(envelope.data).toBeDefined();
    expect(envelope.data!.securityScore).toBe(96);
    expect(envelope.data!.freshnessStatus).toBe('FRESH');
  });

  it('2. should return STALE state when telemetry age exceeds 60s grace threshold', async () => {
    const tenantId = 'tenant-fintech-beta';
    service.setTenantTelemetryState(tenantId, {
      lastTelemetryTime: Date.now() - 95000, // 95 seconds ago
      isDegraded: false,
    });

    const envelope = await service.getOverview(tenantId, 'corr-002');

    expect(envelope.status).toBe('STALE');
    expect(envelope.isStale).toBe(true);
    expect(envelope.staleGracePeriodSeconds).toBe(120);
    expect(envelope.data!.freshnessStatus).toBe('WARNING');
  });

  it('3. should return DEGRADED state with explicit reason during upstream connector failure', async () => {
    const tenantId = 'tenant-healthcare-gamma';
    service.setTenantTelemetryState(tenantId, {
      lastTelemetryTime: Date.now() - 5000,
      isDegraded: true,
      degradedReason: 'AWS GuardDuty ingestion connector rate limited; AI Copilot in deterministic fallback mode',
    });

    const envelope = await service.getOverview(tenantId, 'corr-003');

    expect(envelope.status).toBe('DEGRADED');
    expect(envelope.isPartial).toBe(true);
    expect(envelope.degradedReason).toContain('AWS GuardDuty ingestion connector');
    expect(envelope.data!.securityScore).toBe(78);
  });

  it('4. should return RECOVERY_IN_PROGRESS state with recovery estimate during cell failover', async () => {
    const tenantId = 'tenant-ecommerce-delta';
    service.setTenantTelemetryState(tenantId, {
      lastTelemetryTime: Date.now(),
      isDegraded: false,
      isRecoveryInProgress: true,
    });

    const envelope = await service.getOverview(tenantId, 'corr-004');

    expect(envelope.status).toBe('RECOVERY_IN_PROGRESS');
    expect(envelope.isPartial).toBe(true);
    expect(envelope.recoveryEstimateMs).toBe(5000);
  });

  it('5. should reject requests without tenant context with UnauthorizedException', async () => {
    await expect(service.getOverview('', 'corr-005')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('6. should return case triage detail with grounded AI citations', async () => {
    const tenantId = 'tenant-bank-alpha';
    const caseId = 'case-sec-9901';

    const envelope = await service.getCaseDetail(tenantId, caseId, 'corr-006');

    expect(envelope.status).toBe('HEALTHY_SYNCED');
    expect(envelope.data!.caseId).toBe(caseId);
    expect(envelope.data!.aiSummary.groundedCitations).toContain(
      'ev:entra:sign-in-failed-101',
    );
    expect(envelope.data!.aiSummary.confidenceScore).toBe(0.98);
  });

  it('7. should return continuous assurance evidence freshness stream', async () => {
    const tenantId = 'tenant-bank-alpha';

    const envelope = await service.getEvidenceFreshness(tenantId, 'corr-007');

    expect(envelope.status).toBe('HEALTHY_SYNCED');
    expect(envelope.data!.frameworks.length).toBe(2);
    expect(envelope.data!.overallFreshnessScore).toBe(0.99);
  });
});
