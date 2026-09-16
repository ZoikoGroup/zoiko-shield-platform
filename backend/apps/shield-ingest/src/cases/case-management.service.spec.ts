import { Test, TestingModule } from '@nestjs/testing';
import { CaseManagementService } from './case-management.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('CaseManagementService (Step 11)', () => {
  let service: CaseManagementService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      case: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      caseTimeline: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      evidenceRecord: {
        findFirst: jest.fn(),
      },
      caseEvidence: {
        create: jest.fn(),
      },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaseManagementService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<CaseManagementService>(CaseManagementService);
  });

  it('should create a case in NEW state and append CREATED timeline entry', async () => {
    const mockCase = {
      id: 'case-1',
      tenant_id: 'tenant-1',
      title: 'Suspicious Login Case',
      status: 'NEW',
    };
    prismaMock.case.create.mockResolvedValue(mockCase);

    const result = await service.createCase({
      tenantId: 'tenant-1',
      environmentId: 'env-1',
      region: 'eu-west-1',
      title: 'Suspicious Login Case',
    });

    expect(result.status).toBe('NEW');
    expect(prismaMock.case.create).toHaveBeenCalled();
    expect(prismaMock.caseTimeline.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entry_type: 'CREATED',
        case_id: 'case-1',
      }),
    });
  });

  it('should execute valid state transition NEW -> TRIAGED', async () => {
    prismaMock.case.findFirst.mockResolvedValue({
      id: 'case-1',
      tenant_id: 'tenant-1',
      status: 'NEW',
    });
    prismaMock.case.update.mockResolvedValue({
      id: 'case-1',
      status: 'TRIAGED',
    });

    const updated = await service.transitionState(
      'tenant-1',
      'case-1',
      'TRIAGED',
    );

    expect(updated.status).toBe('TRIAGED');
    expect(prismaMock.caseTimeline.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entry_type: 'STATE_TRANSITION',
      }),
    });
  });

  it('should reject illegal state transition NEW -> CLOSED', async () => {
    prismaMock.case.findFirst.mockResolvedValue({
      id: 'case-1',
      tenant_id: 'tenant-1',
      status: 'NEW',
    });

    await expect(
      service.transitionState('tenant-1', 'case-1', 'CLOSED'),
    ).rejects.toThrow(ConflictException);
  });

  it('should add analyst note to timeline', async () => {
    prismaMock.case.findFirst.mockResolvedValue({
      id: 'case-1',
      tenant_id: 'tenant-1',
    });
    prismaMock.caseTimeline.create.mockResolvedValue({
      id: 'tl-1',
      event_type: 'NOTE_ADDED',
    });

    const note = await service.addNote(
      'tenant-1',
      'case-1',
      'Investigated IP 192.168.1.1',
    );

    expect(prismaMock.caseTimeline.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entry_type: 'NOTE_ADDED',
      }),
    });
  });

  it('linking evidence creates the real CaseEvidence relation, not just a timeline entry', async () => {
    prismaMock.case.findFirst.mockResolvedValue({
      id: 'case-1',
      tenant_id: 'tenant-1',
    });
    prismaMock.evidenceRecord.findFirst.mockResolvedValue({ id: 'ev-1' });
    prismaMock.caseEvidence.create.mockResolvedValue({ id: 'link-1' });
    prismaMock.caseTimeline.create.mockResolvedValue({
      id: 'tl-1',
      entry_type: 'EVIDENCE_LINKED',
    });

    await service.linkEvidence('tenant-1', 'case-1', 'ev-1', 'analyst-1');

    expect(prismaMock.caseEvidence.create).toHaveBeenCalledWith({
      data: {
        tenant_id: 'tenant-1',
        case_id: 'case-1',
        evidence_id: 'ev-1',
        added_by: 'analyst-1',
      },
    });
    expect(prismaMock.caseTimeline.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entry_type: 'EVIDENCE_LINKED',
        evidence_ref: 'ev-1',
      }),
    });
  });

  it('rejects linking an evidence record that does not exist for the tenant', async () => {
    prismaMock.case.findFirst.mockResolvedValue({
      id: 'case-1',
      tenant_id: 'tenant-1',
    });
    prismaMock.evidenceRecord.findFirst.mockResolvedValue(null);

    await expect(
      service.linkEvidence('tenant-1', 'case-1', 'ev-missing', 'analyst-1'),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.caseEvidence.create).not.toHaveBeenCalled();
  });
});
