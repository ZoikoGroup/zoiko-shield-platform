import { Test, TestingModule } from '@nestjs/testing';
import { EvidenceAutoCreationService } from './evidence-auto-creation.service';
import { EvidenceService } from './services/evidence.service';
import { KafkaConsumerService } from '../../kafka/kafka-consumer.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * EvidenceLineage had zero writers in production code: createEvidence
 * supports a parentEvidenceId, but no caller ever passed one, so
 * GET /evidence/:id/lineage returned [] for every record in the system.
 * These tests pin the wiring that makes a case's SOURCE evidence the
 * lineage parent of everything later recorded about that case.
 */
describe('EvidenceAutoCreationService lineage wiring', () => {
  let service: EvidenceAutoCreationService;
  let evidenceServiceMock: any;
  let prismaMock: any;

  beforeEach(async () => {
    evidenceServiceMock = {
      createEvidence: jest.fn().mockResolvedValue({ id: 'evidence-new' }),
    };
    prismaMock = {
      caseEvidence: {
        findFirst: jest.fn().mockResolvedValue({ evidence_id: 'evidence-src' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvidenceAutoCreationService,
        { provide: EvidenceService, useValue: evidenceServiceMock },
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: KafkaConsumerService,
          useValue: { registerHandler: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(EvidenceAutoCreationService);
  });

  const transitionParams = {
    tenantId: 'tenant-a',
    environmentId: 'env-1',
    region: 'us-east-1',
    caseId: 'case-1',
    fromState: 'NEW',
    toState: 'TRIAGED',
    actorId: 'analyst-1',
    reason: 'triaged',
  };

  it('chains case-transition evidence to the case SOURCE evidence', async () => {
    await service.createForCaseTransition(transitionParams);

    expect(prismaMock.caseEvidence.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenant_id: 'tenant-a',
          case_id: 'case-1',
          relationship: 'SOURCE',
        },
      }),
    );
    expect(evidenceServiceMock.createEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        parentEvidenceId: 'evidence-src',
        lineageRelationship: 'DERIVED_FROM',
      }),
    );
  });

  it('chains case-decision evidence to the case SOURCE evidence', async () => {
    await service.createForCaseDecision({
      tenantId: 'tenant-a',
      environmentId: 'env-1',
      region: 'us-east-1',
      caseId: 'case-1',
      decisionType: 'ACCEPT_RISK',
      decision: 'Accepted',
      rationale: 'low blast radius',
      actorId: 'analyst-1',
    });

    expect(evidenceServiceMock.createEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        evidenceType: 'CASE_DECISION',
        parentEvidenceId: 'evidence-src',
        lineageRelationship: 'DERIVED_FROM',
      }),
    );
  });

  it('records evidence with no parent when the case has no SOURCE evidence yet', async () => {
    prismaMock.caseEvidence.findFirst.mockResolvedValue(null);

    await service.createForCaseTransition(transitionParams);

    expect(evidenceServiceMock.createEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        parentEvidenceId: undefined,
        lineageRelationship: undefined,
      }),
    );
  });
});
