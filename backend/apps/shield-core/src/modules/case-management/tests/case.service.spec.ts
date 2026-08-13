import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CaseService } from '../services/case.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CaseRepository } from '../repositories/case.repository';
import { CaseStateMachineService } from '../state-machine/case-state-machine.service';
import { CaseTimelineService } from '../timeline/case-timeline.service';
import { EvidenceService } from '../../evidence/services/evidence.service';
import { EvidenceAutoCreationService } from '../../evidence/evidence-auto-creation.service';

describe('CaseService', () => {
  let service: CaseService;
  let prismaMock: any;
  let caseRepoMock: any;
  let timelineMock: any;
  let evidenceServiceMock: any;
  let evidenceAutoCreationMock: any;

  const alert = {
    id: 'alert-1',
    tenant_id: 'tenant-a',
    environment_id: 'env-1',
    region: 'us',
    title: 'Suspicious Login',
    description: 'desc',
    severity: 'HIGH',
    priority: 'P2',
    primary_identity_id: 'identity-1',
    primary_asset_id: null,
    detection_match_id: 'match-1',
  };

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
      case: {
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve(data)),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      caseAlert: { create: jest.fn().mockResolvedValue({}) },
      caseEvidence: { create: jest.fn().mockResolvedValue({}) },
      caseTransition: { create: jest.fn().mockResolvedValue({ id: 'transition-1' }) },
      outboxEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    caseRepoMock = {
      findAlertByTenantAndId: jest.fn().mockResolvedValue(alert),
      findByTenantAndId: jest.fn(),
    };
    timelineMock = { append: jest.fn().mockResolvedValue({}) };
    evidenceServiceMock = { createEvidence: jest.fn().mockResolvedValue({ id: 'evidence-1' }) };
    evidenceAutoCreationMock = {
      createForCaseTransition: jest.fn().mockResolvedValue({ id: 'transition-evidence-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaseService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: OutboxService, useValue: new OutboxService() },
        { provide: CaseRepository, useValue: caseRepoMock },
        CaseStateMachineService,
        { provide: CaseTimelineService, useValue: timelineMock },
        { provide: EvidenceService, useValue: evidenceServiceMock },
        { provide: EvidenceAutoCreationService, useValue: evidenceAutoCreationMock },
      ],
    }).compile();

    service = module.get<CaseService>(CaseService);
  });

  it('creates a Case from an Alert, links it, creates timeline entries, and creates source evidence (spec §9)', async () => {
    const createdCase = await service.createFromAlert({ tenantId: 'tenant-a', alertId: 'alert-1', actorId: 'analyst-1' });

    expect(createdCase.status).toBe('NEW');
    expect(prismaMock.caseAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ alert_id: 'alert-1', relationship_type: 'PRIMARY' }) }),
    );
    expect(timelineMock.append).toHaveBeenCalledWith(expect.objectContaining({ entryType: 'CASE_CREATED' }));
    expect(timelineMock.append).toHaveBeenCalledWith(expect.objectContaining({ entryType: 'ALERT_LINKED' }));
    expect(evidenceServiceMock.createEvidence).toHaveBeenCalledTimes(1);
    expect(prismaMock.caseEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ evidence_id: 'evidence-1', relationship: 'SOURCE' }) }),
    );
  });

  it('throws NotFoundException escalating an alert that does not belong to the tenant (wrong-tenant alert cannot link)', async () => {
    caseRepoMock.findAlertByTenantAndId.mockResolvedValue(null);

    await expect(service.createFromAlert({ tenantId: 'tenant-b', alertId: 'alert-1', actorId: 'analyst-1' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('allows a valid state transition and records a CaseTransition with actor + reason', async () => {
    caseRepoMock.findByTenantAndId.mockResolvedValue({
      id: 'case-1',
      tenant_id: 'tenant-a',
      environment_id: 'env-1',
      region: 'us',
      status: 'NEW',
    });

    const transition = await service.transition({
      tenantId: 'tenant-a',
      caseId: 'case-1',
      toState: 'TRIAGED',
      actorId: 'analyst-1',
      reason: 'Initial triage complete',
    });

    expect(transition.id).toBe('transition-1');
    expect(prismaMock.caseTransition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ from_state: 'NEW', to_state: 'TRIAGED', actor_id: 'analyst-1', reason: 'Initial triage complete' }),
      }),
    );
    expect(evidenceAutoCreationMock.createForCaseTransition).toHaveBeenCalledWith(
      expect.objectContaining({ environmentId: 'env-1', caseId: 'case-1' }),
    );
  });

  it('rejects an invalid state transition (NEW -> INVESTIGATING skips TRIAGED)', async () => {
    caseRepoMock.findByTenantAndId.mockResolvedValue({ id: 'case-1', tenant_id: 'tenant-a', status: 'NEW' });

    await expect(
      service.transition({ tenantId: 'tenant-a', caseId: 'case-1', toState: 'INVESTIGATING', actorId: 'analyst-1', reason: 'skip ahead' }),
    ).rejects.toThrow(BadRequestException);
  });
});
