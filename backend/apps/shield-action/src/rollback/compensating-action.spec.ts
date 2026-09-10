import { Test, TestingModule } from '@nestjs/testing';
import {
  CompensatingActionService,
  RollbackCompensationPlan,
  RollbackProgressTelemetry,
} from './compensating-action.service';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('CompensatingActionService', () => {
  let service: CompensatingActionService;

  const samplePlan: RollbackCompensationPlan = {
    planId: 'plan-rollback-01',
    tenantId: 'tenant-enterprise-bank-01',
    commandId: 'cmd-isolate-db-99',
    originalAction: 'ISOLATE_ENDPOINT',
    compensatingAction: 'UNQUARANTINE_ENDPOINT',
    targetResource: 'srv-db-prod-01',
    singleUseRollbackToken: 'ZS-ROLLBACK-TOKEN-4a8b7c6d-0001',
    reversibilityTier: 'R1',
    createdAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CompensatingActionService],
    }).compile();

    service = module.get<CompensatingActionService>(CompensatingActionService);
  });

  it('should register a compensation plan and execute multi-stage rollback', async () => {
    service.registerCompensationPlan(samplePlan);

    const progressStages: RollbackProgressTelemetry[] = [];
    const receipt = await service.executeRollback(
      samplePlan.tenantId,
      samplePlan.singleUseRollbackToken,
      'analyst.lead@acme.com',
      (telemetry) => progressStages.push(telemetry),
    );

    expect(receipt).toBeDefined();
    expect(receipt.status).toBe('REVERTED_SUCCESSFULLY');
    expect(receipt.observedState).toBe('NORMALIZED_RESTORED');
    expect(receipt.compensatingAction).toBe('UNQUARANTINE_ENDPOINT');
    expect(receipt.attestationDigest).toBeDefined();

    // Verify 4 progress stages were emitted
    expect(progressStages.length).toBe(4);
    expect(progressStages[0].stage).toBe('VALIDATING_TOKEN_INTEGRITY');
    expect(progressStages[1].stage).toBe('DISPATCHING_REVERSAL_ADAPTER');
    expect(progressStages[2].stage).toBe('RECONCILING_OBSERVED_STATE');
    expect(progressStages[3].stage).toBe('ROLLBACK_COMPLETED');
    expect(progressStages[3].isReverted).toBe(true);
    expect(progressStages[3].progressPercent).toBe(100);
  });

  it('should strictly reject replay of a consumed single-use rollback token', async () => {
    service.registerCompensationPlan(samplePlan);

    // First execution passes
    await service.executeRollback(
      samplePlan.tenantId,
      samplePlan.singleUseRollbackToken,
      'analyst.lead@acme.com',
    );

    expect(service.isTokenConsumed(samplePlan.singleUseRollbackToken)).toBe(true);

    // Second execution with same token MUST throw ForbiddenException
    await expect(
      service.executeRollback(
        samplePlan.tenantId,
        samplePlan.singleUseRollbackToken,
        'analyst.lead@acme.com',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should throw NotFoundException for unregistered rollback tokens', async () => {
    await expect(
      service.executeRollback(
        samplePlan.tenantId,
        'ZS-ROLLBACK-TOKEN-nonexistent',
        'analyst.lead@acme.com',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when registering invalid plan', () => {
    expect(() =>
      service.registerCompensationPlan({
        ...samplePlan,
        tenantId: '',
      }),
    ).toThrow(BadRequestException);
  });
});
