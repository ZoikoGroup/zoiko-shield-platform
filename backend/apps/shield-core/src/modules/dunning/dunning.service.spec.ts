import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { DunningService } from './dunning.service';
import { DunningPolicyService } from './dunning-policy.service';
import { ContractStateService } from '../commerce/contract-state.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('DunningService (ZS-COM-BILL-001 Part 18, policy-driven, fail closed)', () => {
  let service: DunningService;
  let prismaMock: any;
  let contractMock: any;
  let policyMock: any;

  const policy = {
    id: 'policy-1',
    restrict_after_days: 14,
    suspend_after_days: 30,
    terminate_after_days: 60,
  };

  beforeEach(async () => {
    prismaMock = {
      dunningCase: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      dunningPolicy: { findUniqueOrThrow: jest.fn().mockResolvedValue(policy) },
    };
    contractMock = { transitionState: jest.fn(), getContractById: jest.fn() };
    policyMock = { getActivePolicy: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DunningService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ContractStateService, useValue: contractMock },
        { provide: DunningPolicyService, useValue: policyMock },
      ],
    }).compile();

    service = module.get<DunningService>(DunningService);
  });

  it('fails closed with no approved dunning policy', async () => {
    policyMock.getActivePolicy.mockResolvedValue(null);

    await expect(
      service.triggerDunning({ contractId: 'c-1', policyKey: 'standard' }),
    ).rejects.toThrow(ConflictException);
    expect(contractMock.transitionState).not.toHaveBeenCalled();
  });

  it('triggering dunning moves the contract to PAST_DUE via the canonical contract state machine', async () => {
    policyMock.getActivePolicy.mockResolvedValue(policy);
    prismaMock.dunningCase.findFirst.mockResolvedValue(null);
    prismaMock.dunningCase.create.mockResolvedValue({
      id: 'case-1',
      status: 'ACTIVE',
    });

    await service.triggerDunning({ contractId: 'c-1', policyKey: 'standard' });

    expect(contractMock.transitionState).toHaveBeenCalledWith(
      'c-1',
      'PAST_DUE',
      expect.any(String),
    );
  });

  it('triggering dunning twice for the same contract is idempotent (returns the existing active case)', async () => {
    policyMock.getActivePolicy.mockResolvedValue(policy);
    prismaMock.dunningCase.findFirst.mockResolvedValue({
      id: 'case-1',
      status: 'ACTIVE',
    });

    const result = await service.triggerDunning({
      contractId: 'c-1',
      policyKey: 'standard',
    });

    expect(result.id).toBe('case-1');
    expect(contractMock.transitionState).not.toHaveBeenCalled();
  });

  it('does not advance before the policy grace window has elapsed', async () => {
    prismaMock.dunningCase.findUnique.mockResolvedValue({
      id: 'case-1',
      status: 'ACTIVE',
      dunning_policy_id: 'policy-1',
      contract_id: 'c-1',
      triggered_at: new Date(), // just now — 0 days elapsed
    });
    contractMock.getContractById.mockResolvedValue({ status: 'PAST_DUE' });

    const result = await service.advanceDunning('case-1');

    expect(result.advanced).toBe(false);
    expect(contractMock.transitionState).not.toHaveBeenCalled();
  });

  it('advances PAST_DUE -> RESTRICTED once restrict_after_days has elapsed', async () => {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    prismaMock.dunningCase.findUnique.mockResolvedValue({
      id: 'case-1',
      status: 'ACTIVE',
      dunning_policy_id: 'policy-1',
      contract_id: 'c-1',
      triggered_at: fifteenDaysAgo,
    });
    contractMock.getContractById.mockResolvedValue({ status: 'PAST_DUE' });
    contractMock.transitionState.mockResolvedValue({ status: 'RESTRICTED' });
    prismaMock.dunningCase.update.mockResolvedValue({
      id: 'case-1',
      status: 'ACTIVE',
    });

    const result = await service.advanceDunning('case-1');

    expect(result.advanced).toBe(true);
    expect(contractMock.transitionState).toHaveBeenCalledWith(
      'c-1',
      'RESTRICTED',
      'dunning-engine',
    );
  });

  it('escalating to TERMINATION_WORKFLOW also flips the dunning case to ESCALATED_TO_TERMINATION', async () => {
    const sixtyOneDaysAgo = new Date(Date.now() - 61 * 24 * 60 * 60 * 1000);
    prismaMock.dunningCase.findUnique.mockResolvedValue({
      id: 'case-1',
      status: 'ACTIVE',
      dunning_policy_id: 'policy-1',
      contract_id: 'c-1',
      triggered_at: sixtyOneDaysAgo,
    });
    contractMock.getContractById.mockResolvedValue({ status: 'SUSPENDED' });
    contractMock.transitionState.mockResolvedValue({
      status: 'TERMINATION_WORKFLOW',
    });
    prismaMock.dunningCase.update.mockResolvedValue({
      id: 'case-1',
      status: 'ESCALATED_TO_TERMINATION',
    });

    const result = await service.advanceDunning('case-1');

    expect(prismaMock.dunningCase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ESCALATED_TO_TERMINATION' }),
      }),
    );
    expect(result.contract.status).toBe('TERMINATION_WORKFLOW');
  });

  it('resolving dunning returns the contract to ACTIVE and closes the case', async () => {
    prismaMock.dunningCase.findUnique.mockResolvedValue({
      id: 'case-1',
      status: 'ACTIVE',
      contract_id: 'c-1',
    });
    contractMock.transitionState.mockResolvedValue({ status: 'ACTIVE' });
    prismaMock.dunningCase.update.mockResolvedValue({
      id: 'case-1',
      status: 'RESOLVED',
    });

    const result = await service.resolveDunning('case-1', 'ops');

    expect(contractMock.transitionState).toHaveBeenCalledWith(
      'c-1',
      'ACTIVE',
      'ops',
    );
    expect(result.status).toBe('RESOLVED');
  });

  it('rejects resolving a case that is not ACTIVE', async () => {
    prismaMock.dunningCase.findUnique.mockResolvedValue({
      id: 'case-1',
      status: 'RESOLVED',
    });

    await expect(service.resolveDunning('case-1')).rejects.toThrow(
      ConflictException,
    );
  });
});
