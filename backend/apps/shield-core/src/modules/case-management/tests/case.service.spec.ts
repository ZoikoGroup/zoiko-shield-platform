import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CaseService } from '../services/case.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CaseRepository } from '../repositories/case.repository';
import { CaseStateMachineService } from '../state-machine/case-state-machine.service';
import { CaseTimelineService } from '../timeline/case-timeline.service';
import { EvidenceService } from '../../evidence/services/evidence.service';
import { EvidenceAutoCreationService } from '../../evidence/evidence-auto-creation.service';
import { SocSlaClockService } from '../../sla/soc-sla-clock.service';
import { CaseQualityReviewService } from '../quality/case-quality-review.service';

describe('CaseService', () => {
  let service: CaseService;
  let prismaMock: any;
  let caseRepoMock: any;
  let timelineMock: any;
  let evidenceServiceMock: any;
  let evidenceAutoCreationMock: any;
  let slaClockMock: any;
  let qualityReviewMock: any;

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
      $transaction: jest
        .fn()
        .mockImplementation((ops: any[]) => Promise.all(ops)),
      case: {
        create: jest
          .fn()
          .mockImplementation(({ data }: any) => Promise.resolve(data)),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      caseAlert: { create: jest.fn().mockResolvedValue({}) },
      caseEvidence: { create: jest.fn().mockResolvedValue({}) },
      caseTransition: {
        create: jest.fn().mockResolvedValue({ id: 'transition-1' }),
      },
      outboxEvent: { create: jest.fn().mockResolvedValue({}) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ count: BigInt(1) }]),
    };
    caseRepoMock = {
      findAlertByTenantAndId: jest.fn().mockResolvedValue(alert),
      findByTenantAndId: jest.fn(),
    };
    timelineMock = { append: jest.fn().mockResolvedValue({}) };
    evidenceServiceMock = {
      createEvidence: jest.fn().mockResolvedValue({ id: 'evidence-1' }),
    };
    evidenceAutoCreationMock = {
      createForCaseTransition: jest
        .fn()
        .mockResolvedValue({ id: 'transition-evidence-1' }),
    };
    slaClockMock = {
      startTriageClock: jest.fn().mockResolvedValue({ status: 'RUNNING' }),
      stopClock: jest
        .fn()
        .mockResolvedValue({ isBreached: false, activeTriageMinutes: 4 }),
      pauseClock: jest.fn().mockResolvedValue({ status: 'PAUSED' }),
      resumeClock: jest.fn().mockResolvedValue({ status: 'RUNNING' }),
      getClock: jest.fn().mockResolvedValue({ status: 'RUNNING' }),
      markBreachedIfOverdue: jest.fn().mockResolvedValue({ status: 'RUNNING' }),
    };
    qualityReviewMock = {
      requiresReview: jest.fn().mockReturnValue(null),
      hasApproval: jest.fn().mockResolvedValue(false),
      request: jest.fn().mockResolvedValue({ id: 'review-1' }),
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
        {
          provide: EvidenceAutoCreationService,
          useValue: evidenceAutoCreationMock,
        },
        { provide: SocSlaClockService, useValue: slaClockMock },
        { provide: CaseQualityReviewService, useValue: qualityReviewMock },
      ],
    }).compile();

    service = module.get<CaseService>(CaseService);
  });

  it('creates a Case from an Alert, links it, creates timeline entries, and creates source evidence (spec §9)', async () => {
    const createdCase = await service.createFromAlert({
      tenantId: 'tenant-a',
      alertId: 'alert-1',
      actorId: 'analyst-1',
    });

    expect(createdCase.status).toBe('NEW');
    expect(prismaMock.case.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ queue_id: 'DEFAULT' }),
      }),
    );
    expect(prismaMock.caseAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          alert_id: 'alert-1',
          relationship_type: 'PRIMARY',
        }),
      }),
    );
    expect(timelineMock.append).toHaveBeenCalledWith(
      expect.objectContaining({ entryType: 'CASE_CREATED' }),
    );
    expect(timelineMock.append).toHaveBeenCalledWith(
      expect.objectContaining({ entryType: 'ALERT_LINKED' }),
    );
    expect(evidenceServiceMock.createEvidence).toHaveBeenCalledTimes(1);
    expect(prismaMock.caseEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evidence_id: 'evidence-1',
          relationship: 'SOURCE',
        }),
      }),
    );
  });

  it('throws NotFoundException escalating an alert that does not belong to the tenant (wrong-tenant alert cannot link)', async () => {
    caseRepoMock.findAlertByTenantAndId.mockResolvedValue(null);

    await expect(
      service.createFromAlert({
        tenantId: 'tenant-b',
        alertId: 'alert-1',
        actorId: 'analyst-1',
      }),
    ).rejects.toThrow(NotFoundException);
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
        data: expect.objectContaining({
          from_state: 'NEW',
          to_state: 'TRIAGED',
          actor_id: 'analyst-1',
          reason: 'Initial triage complete',
        }),
      }),
    );
    expect(
      evidenceAutoCreationMock.createForCaseTransition,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ environmentId: 'env-1', caseId: 'case-1' }),
    );
  });

  it('rejects an invalid state transition (NEW -> INVESTIGATING skips TRIAGED)', async () => {
    caseRepoMock.findByTenantAndId.mockResolvedValue({
      id: 'case-1',
      tenant_id: 'tenant-a',
      status: 'NEW',
    });

    await expect(
      service.transition({
        tenantId: 'tenant-a',
        caseId: 'case-1',
        toState: 'INVESTIGATING',
        actorId: 'analyst-1',
        reason: 'skip ahead',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates a standalone case with no alert, and links no alert or source evidence', async () => {
    const created = await service.createStandalone({
      tenantId: 'tenant-a',
      environmentId: 'env-1',
      region: 'us',
      title: 'Manual investigation',
      actorId: 'analyst-1',
    });

    expect(created.title).toBe('Manual investigation');
    expect(created.status).toBe('NEW');
    expect(created.queue_id).toBe('DEFAULT');
    expect(prismaMock.caseAlert.create).not.toHaveBeenCalled();
    expect(evidenceServiceMock.createEvidence).not.toHaveBeenCalled();
    expect(timelineMock.append).toHaveBeenCalledWith(
      expect.objectContaining({ entryType: 'CASE_CREATED' }),
    );
  });

  it('applies field updates on update() instead of silently ignoring the body', async () => {
    caseRepoMock.findByTenantAndId.mockResolvedValue({
      id: 'case-1',
      tenant_id: 'tenant-a',
      status: 'NEW',
    });

    await service.update({
      tenantId: 'tenant-a',
      caseId: 'case-1',
      title: 'Retitled',
      severity: 'CRITICAL',
      queue: 'TIER2',
    });

    expect(prismaMock.case.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: { title: 'Retitled', severity: 'CRITICAL', queue_id: 'TIER2' },
    });
  });

  const OWNER_ID = '9e0f71cb-a7be-42ec-85f4-215e0784bc8d';

  it('assigns an owner and appends an ASSIGNMENT_CHANGED timeline entry', async () => {
    caseRepoMock.findByTenantAndId.mockResolvedValue({
      id: 'case-1',
      tenant_id: 'tenant-a',
      status: 'NEW',
    });
    prismaMock.$queryRawUnsafe.mockResolvedValue([{ count: BigInt(1) }]);

    await service.assign({
      tenantId: 'tenant-a',
      caseId: 'case-1',
      ownerId: OWNER_ID,
      actorId: 'soc-lead',
    });

    expect(prismaMock.case.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: { owner_id: OWNER_ID },
    });
    expect(timelineMock.append).toHaveBeenCalledWith(
      expect.objectContaining({
        entryType: 'ASSIGNMENT_CHANGED',
        actorId: 'soc-lead',
      }),
    );
  });

  it('refuses to assign a case to someone who is not an active member of the tenant', async () => {
    caseRepoMock.findByTenantAndId.mockResolvedValue({
      id: 'case-1',
      tenant_id: 'tenant-a',
      status: 'NEW',
    });
    prismaMock.$queryRawUnsafe.mockResolvedValue([{ count: BigInt(0) }]);

    await expect(
      service.assign({
        tenantId: 'tenant-a',
        caseId: 'case-1',
        ownerId: OWNER_ID,
        actorId: 'soc-lead',
      }),
    ).rejects.toThrow(BadRequestException);
    // Ownership is an accountability record — a bad owner must not be written.
    expect(prismaMock.case.update).not.toHaveBeenCalled();
  });

  it('rejects an owner id that is not a user identifier at all (e.g. a pasted tenant id or typo)', async () => {
    caseRepoMock.findByTenantAndId.mockResolvedValue({
      id: 'case-1',
      tenant_id: 'tenant-a',
      status: 'NEW',
    });

    await expect(
      service.assign({
        tenantId: 'tenant-a',
        caseId: 'case-1',
        ownerId: 'bob',
        actorId: 'soc-lead',
      }),
    ).rejects.toThrow(BadRequestException);
    // Rejected before it reaches the database.
    expect(prismaMock.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(prismaMock.case.update).not.toHaveBeenCalled();
  });

  it('linking evidence creates the real CaseEvidence relation, not just a timeline entry', async () => {
    caseRepoMock.findByTenantAndId.mockResolvedValue({
      id: 'case-1',
      tenant_id: 'tenant-a',
      status: 'NEW',
    });
    prismaMock.evidenceRecord = {
      findFirst: jest.fn().mockResolvedValue({ id: 'ev-1' }),
    };
    prismaMock.caseTimelineEntry = {
      create: jest.fn().mockResolvedValue({ id: 'tl-1' }),
    };

    await service.linkEvidence({
      tenantId: 'tenant-a',
      caseId: 'case-1',
      evidenceId: 'ev-1',
      actorId: 'analyst-1',
    });

    expect(prismaMock.caseEvidence.create).toHaveBeenCalledWith({
      data: {
        tenant_id: 'tenant-a',
        case_id: 'case-1',
        evidence_id: 'ev-1',
        added_by: 'analyst-1',
      },
    });
    expect(prismaMock.caseTimelineEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entry_type: 'EVIDENCE_ATTACHED' }),
      }),
    );
  });

  it('starts the SLA triage clock when a case is transitioned to TRIAGED', async () => {
    caseRepoMock.findByTenantAndId.mockResolvedValue({
      id: 'case-1',
      tenant_id: 'tenant-a',
      environment_id: 'env-1',
      region: 'us',
      severity: 'CRITICAL',
      status: 'NEW',
    });

    await service.transition({
      tenantId: 'tenant-a',
      caseId: 'case-1',
      toState: 'TRIAGED',
      actorId: 'analyst-1',
      reason: 'picked up',
    });

    expect(slaClockMock.startTriageClock).toHaveBeenCalledWith({
      caseId: 'case-1',
      tenantId: 'tenant-a',
      severity: 'CRITICAL',
    });
  });

  it('stops the SLA triage clock when a case reaches RESOLVED', async () => {
    caseRepoMock.findByTenantAndId.mockResolvedValue({
      id: 'case-1',
      tenant_id: 'tenant-a',
      environment_id: 'env-1',
      region: 'us',
      severity: 'HIGH',
      status: 'INVESTIGATING',
    });
    slaClockMock.getClock.mockResolvedValue({ status: 'RUNNING' });

    await service.transition({
      tenantId: 'tenant-a',
      caseId: 'case-1',
      toState: 'RESOLVED',
      actorId: 'analyst-1',
      reason: 'done',
    });

    expect(slaClockMock.stopClock).toHaveBeenCalledWith('case-1');
  });

  it('does not fail the transition when SLA clock bookkeeping errors', async () => {
    caseRepoMock.findByTenantAndId.mockResolvedValue({
      id: 'case-1',
      tenant_id: 'tenant-a',
      environment_id: 'env-1',
      region: 'us',
      severity: 'HIGH',
      status: 'NEW',
    });
    slaClockMock.startTriageClock.mockRejectedValue(new Error('clock down'));

    const transition = await service.transition({
      tenantId: 'tenant-a',
      caseId: 'case-1',
      toState: 'TRIAGED',
      actorId: 'analyst-1',
      reason: 'picked up',
    });

    // The state change is the security-relevant fact; SLA is bookkeeping.
    expect(transition.id).toBe('transition-1');
  });

  it('blocks a material transition until a quality review is approved, opening one', async () => {
    caseRepoMock.findByTenantAndId.mockResolvedValue({
      id: 'case-1',
      tenant_id: 'tenant-a',
      environment_id: 'env-1',
      region: 'us',
      severity: 'CRITICAL',
      status: 'RESOLVED',
    });
    qualityReviewMock.requiresReview.mockReturnValue('CLOSURE_REVIEW');
    qualityReviewMock.hasApproval.mockResolvedValue(false);

    await expect(
      service.transition({
        tenantId: 'tenant-a',
        caseId: 'case-1',
        toState: 'CLOSED',
        actorId: 'analyst-1',
        reason: 'closing out',
      }),
    ).rejects.toThrow(ConflictException);

    expect(qualityReviewMock.request).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: 'case-1',
        reviewType: 'CLOSURE_REVIEW',
        requestedBy: 'analyst-1',
      }),
    );
    // The case must not have moved.
    expect(prismaMock.caseTransition.create).not.toHaveBeenCalled();
  });

  it('allows the material transition once a review has been approved', async () => {
    caseRepoMock.findByTenantAndId.mockResolvedValue({
      id: 'case-1',
      tenant_id: 'tenant-a',
      environment_id: 'env-1',
      region: 'us',
      severity: 'CRITICAL',
      status: 'RESOLVED',
    });
    qualityReviewMock.requiresReview.mockReturnValue('CLOSURE_REVIEW');
    qualityReviewMock.hasApproval.mockResolvedValue(true);

    const transition = await service.transition({
      tenantId: 'tenant-a',
      caseId: 'case-1',
      toState: 'CLOSED',
      actorId: 'analyst-1',
      reason: 'closing out',
    });

    expect(transition.id).toBe('transition-1');
    expect(qualityReviewMock.request).not.toHaveBeenCalled();
  });

  it('re-checks an overdue RUNNING clock when the clock is read', async () => {
    caseRepoMock.findByTenantAndId.mockResolvedValue({
      id: 'case-1',
      tenant_id: 'tenant-a',
      status: 'TRIAGED',
    });
    slaClockMock.getClock.mockResolvedValue({ status: 'RUNNING' });
    slaClockMock.markBreachedIfOverdue.mockResolvedValue({
      status: 'BREACHED',
    });

    const clock = await service.getSlaClock('tenant-a', 'case-1');

    expect(slaClockMock.markBreachedIfOverdue).toHaveBeenCalledWith('case-1');
    expect(clock?.status).toBe('BREACHED');
  });

  it('rejects linking evidence that does not belong to the tenant', async () => {
    caseRepoMock.findByTenantAndId.mockResolvedValue({
      id: 'case-1',
      tenant_id: 'tenant-a',
      status: 'NEW',
    });
    prismaMock.evidenceRecord = {
      findFirst: jest.fn().mockResolvedValue(null),
    };

    await expect(
      service.linkEvidence({
        tenantId: 'tenant-a',
        caseId: 'case-1',
        evidenceId: 'ev-missing',
        actorId: 'analyst-1',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.caseEvidence.create).not.toHaveBeenCalled();
  });
});
