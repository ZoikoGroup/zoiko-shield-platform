import { Test, TestingModule } from '@nestjs/testing';
import { ContractRenewalWorker } from './contract-renewal.worker';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialEventPublisherService } from './commercial-event-publisher.service';

describe('ContractRenewalWorker', () => {
  let worker: ContractRenewalWorker;
  let mockPrisma: any;
  let mockEventPublisher: any;

  beforeEach(async () => {
    mockPrisma = {
      contract: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      commercialEvent: {
        create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
      },
    };

    mockEventPublisher = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractRenewalWorker,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CommercialEventPublisherService, useValue: mockEventPublisher },
      ],
    }).compile();

    worker = module.get<ContractRenewalWorker>(ContractRenewalWorker);
  });

  it('evaluates and transitions expired ACTIVE contract to PAST_DUE', async () => {
    const now = new Date('2026-08-26T00:00:00.000Z');
    const expiredContract = {
      id: 'contract-expired-1',
      status: 'ACTIVE',
      termEnd: new Date('2026-08-25T00:00:00.000Z'),
    };

    mockPrisma.contract.findMany.mockResolvedValue([expiredContract]);
    mockPrisma.contract.update.mockResolvedValue({ ...expiredContract, status: 'PAST_DUE' });

    const results = await worker.evaluateExpiringContracts(now);

    expect(results).toHaveLength(1);
    expect(results[0].milestone).toBe('EXPIRED');
    expect(results[0].status).toBe('PAST_DUE');
    expect(mockPrisma.contract.update).toHaveBeenCalledWith({
      where: { id: 'contract-expired-1' },
      data: { status: 'PAST_DUE' },
    });
    expect(mockPrisma.commercialEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_type: 'contract.state_changed',
        }),
      }),
    );
  });

  it('evaluates and transitions expired CANCEL_AT_TERM contract to TERMINATED', async () => {
    const now = new Date('2026-08-26T00:00:00.000Z');
    const cancelContract = {
      id: 'contract-cancel-1',
      status: 'CANCEL_AT_TERM',
      termEnd: new Date('2026-08-20T00:00:00.000Z'),
    };

    mockPrisma.contract.findMany.mockResolvedValue([cancelContract]);
    mockPrisma.contract.update.mockResolvedValue({ ...cancelContract, status: 'TERMINATED' });

    const results = await worker.evaluateExpiringContracts(now);

    expect(results).toHaveLength(1);
    expect(results[0].milestone).toBe('EXPIRED');
    expect(results[0].status).toBe('TERMINATED');
    expect(mockPrisma.contract.update).toHaveBeenCalledWith({
      where: { id: 'contract-cancel-1' },
      data: { status: 'TERMINATED' },
    });
  });

  it('detects 7-day warning milestone without modifying state', async () => {
    const now = new Date('2026-08-26T00:00:00.000Z');
    const warningContract = {
      id: 'contract-warn-1',
      status: 'ACTIVE',
      termEnd: new Date('2026-08-30T00:00:00.000Z'), // 4 days away
    };

    mockPrisma.contract.findMany.mockResolvedValue([warningContract]);

    const results = await worker.evaluateExpiringContracts(now);

    expect(results).toHaveLength(1);
    expect(results[0].milestone).toBe('WARNING_7_DAYS');
    expect(results[0].status).toBe('ACTIVE');
    expect(mockPrisma.contract.update).not.toHaveBeenCalled();
  });

  it('detects 30-day notice milestone without modifying state', async () => {
    const now = new Date('2026-08-26T00:00:00.000Z');
    const noticeContract = {
      id: 'contract-notice-1',
      status: 'ACTIVE',
      termEnd: new Date('2026-09-15T00:00:00.000Z'), // 20 days away
    };

    mockPrisma.contract.findMany.mockResolvedValue([noticeContract]);

    const results = await worker.evaluateExpiringContracts(now);

    expect(results).toHaveLength(1);
    expect(results[0].milestone).toBe('NOTICE_30_DAYS');
    expect(results[0].status).toBe('ACTIVE');
    expect(mockPrisma.contract.update).not.toHaveBeenCalled();
  });
});
