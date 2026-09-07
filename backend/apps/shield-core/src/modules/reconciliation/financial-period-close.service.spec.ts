import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  FinancialPeriodCloseService,
  CloseFinancialPeriodDto,
} from './financial-period-close.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('FinancialPeriodCloseService (ZS-FIN-PERIOD-CLOSE)', () => {
  let service: FinancialPeriodCloseService;
  let prismaMock: any;

  const BASE_DTO: CloseFinancialPeriodDto = {
    periodKey: '2026-07',
    periodStart: '2026-07-01T00:00:00Z',
    periodEnd: '2026-07-31T23:59:59Z',
    closingNotes: 'End-of-month financial close',
    approverId: 'approver-1',
    dualControlSignoffId: 'signoff-1',
  };
  const ACTOR_ID = 'actor-99';

  beforeEach(async () => {
    prismaMock = {
      reconciliationIssue: { count: jest.fn().mockResolvedValue(0) },
      commercialEvent: {
        create: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'event-uuid-1',
          created_at: new Date('2026-07-31T23:59:59Z'),
          ...data,
        })),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancialPeriodCloseService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<FinancialPeriodCloseService>(FinancialPeriodCloseService);
  });

  // ─── Happy Path ───────────────────────────────────────────────────────────

  describe('closePeriod — happy path', () => {
    it('locks a period and returns LOCKED status with all required fields', async () => {
      const result = await service.closePeriod(BASE_DTO, ACTOR_ID);

      expect(result.status).toBe('LOCKED');
      expect(result.periodKey).toBe('2026-07');
      expect(result.lockedBy).toBe(ACTOR_ID);
      expect(result.approverId).toBe('approver-1');
      expect(result.dualControlSignoffId).toBe('signoff-1');
      expect(result.id).toBeDefined();
    });

    it('writes a commercial event of type financial_period.closed', async () => {
      await service.closePeriod(BASE_DTO, ACTOR_ID);

      expect(prismaMock.commercialEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event_type: 'financial_period.closed',
          }),
        }),
      );
    });

    it('encodes the period key in the idempotency_key', async () => {
      await service.closePeriod(BASE_DTO, ACTOR_ID);

      const createCall = prismaMock.commercialEvent.create.mock.calls[0][0];
      expect(createCall.data.idempotency_key).toContain('2026-07');
    });
  });

  // ─── Validation Guards ────────────────────────────────────────────────────

  describe('closePeriod — validation guards', () => {
    it('throws BadRequestException when periodKey is missing', async () => {
      const dto = { ...BASE_DTO, periodKey: '' };
      await expect(service.closePeriod(dto, ACTOR_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when approverId is missing', async () => {
      const dto = { ...BASE_DTO, approverId: '' };
      await expect(service.closePeriod(dto, ACTOR_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when dualControlSignoffId is missing', async () => {
      const dto = { ...BASE_DTO, dualControlSignoffId: '' };
      await expect(service.closePeriod(dto, ACTOR_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── Dual-Control Enforcement ─────────────────────────────────────────────

  describe('closePeriod — dual-control rule violations', () => {
    it('rejects when approver and dual-control signoff are the same user', async () => {
      const dto = {
        ...BASE_DTO,
        approverId: 'same-user',
        dualControlSignoffId: 'same-user',
      };
      await expect(service.closePeriod(dto, ACTOR_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects when actor is the same as the approver', async () => {
      const dto = { ...BASE_DTO, approverId: ACTOR_ID };
      await expect(service.closePeriod(dto, ACTOR_ID)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── Open Reconciliation Issues Block Close ───────────────────────────────

  describe('closePeriod — reconciliation pre-check', () => {
    it('rejects period close when critical reconciliation issues are open', async () => {
      prismaMock.reconciliationIssue.count.mockResolvedValue(2);

      await expect(service.closePeriod(BASE_DTO, ACTOR_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('error message references the open issue count and period key', async () => {
      prismaMock.reconciliationIssue.count.mockResolvedValue(5);

      await expect(service.closePeriod(BASE_DTO, ACTOR_ID)).rejects.toThrow(
        /5.*CRITICAL|CRITICAL.*5/,
      );
    });
  });

  // ─── isPeriodLocked ───────────────────────────────────────────────────────

  describe('isPeriodLocked', () => {
    it('returns false when no closed-period event exists', async () => {
      prismaMock.commercialEvent.findFirst.mockResolvedValue(null);
      const locked = await service.isPeriodLocked('2026-07');
      expect(locked).toBe(false);
    });

    it('returns true when a matching financial_period.closed event exists', async () => {
      prismaMock.commercialEvent.findFirst.mockResolvedValue({
        id: 'event-1',
        event_type: 'financial_period.closed',
      });
      const locked = await service.isPeriodLocked('2026-07');
      expect(locked).toBe(true);
    });
  });

  // ─── listPeriodStatuses ───────────────────────────────────────────────────

  describe('listPeriodStatuses', () => {
    it('returns an empty array when no period events exist', async () => {
      prismaMock.commercialEvent.findMany.mockResolvedValue([]);
      const statuses = await service.listPeriodStatuses();
      expect(statuses).toEqual([]);
    });

    it('deserializes JSON payload and spreads it into the response', async () => {
      const payload = {
        periodKey: '2026-06',
        status: 'LOCKED',
        lockedAt: '2026-06-30T23:59:59Z',
      };
      prismaMock.commercialEvent.findMany.mockResolvedValue([
        {
          id: 'evt-1',
          event_type: 'financial_period.closed',
          created_at: new Date('2026-06-30T23:59:59Z'),
          payload: JSON.stringify(payload),
        },
      ]);

      const statuses = await service.listPeriodStatuses();
      expect(statuses[0]).toMatchObject({
        id: 'evt-1',
        periodKey: '2026-06',
        status: 'LOCKED',
      });
    });

    it('gracefully handles events with malformed payloads without throwing', async () => {
      prismaMock.commercialEvent.findMany.mockResolvedValue([
        {
          id: 'evt-bad',
          event_type: 'financial_period.closed',
          created_at: new Date(),
          payload: 'NOT_VALID_JSON{{{',
        },
      ]);

      const statuses = await service.listPeriodStatuses();
      expect(statuses).toHaveLength(1);
      expect(statuses[0].id).toBe('evt-bad');
    });
  });
});
