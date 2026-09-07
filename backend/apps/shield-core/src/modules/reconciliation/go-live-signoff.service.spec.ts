import { Test, TestingModule } from '@nestjs/testing';
import { GoLiveSignoffService } from './go-live-signoff.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('GoLiveSignoffService (G1 Gate — Production Readiness Audit)', () => {
  let service: GoLiveSignoffService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      commercialAccount: { count: jest.fn() },
      priceBook: { count: jest.fn() },
      reconciliationIssue: { count: jest.fn() },
      commercialEvent: { count: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoLiveSignoffService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<GoLiveSignoffService>(GoLiveSignoffService);
  });

  describe('generateGoLiveAuditReport — happy path', () => {
    it('returns READY_FOR_PRODUCTION when all categories pass', async () => {
      prismaMock.commercialAccount.count.mockResolvedValue(3);
      prismaMock.priceBook.count.mockResolvedValue(2);
      prismaMock.reconciliationIssue.count.mockResolvedValue(0);
      prismaMock.commercialEvent.count.mockResolvedValue(5);

      const report = await service.generateGoLiveAuditReport();

      expect(report.overallReadiness).toBe('READY_FOR_PRODUCTION');
      expect(report.checksCount).toBe(4);
      expect(report.categories.every((c) => c.status !== 'FAILED')).toBe(true);
    });

    it('includes evaluatedAt as a valid ISO-8601 timestamp', async () => {
      prismaMock.commercialAccount.count.mockResolvedValue(1);
      prismaMock.priceBook.count.mockResolvedValue(1);
      prismaMock.reconciliationIssue.count.mockResolvedValue(0);
      prismaMock.commercialEvent.count.mockResolvedValue(0);

      const report = await service.generateGoLiveAuditReport();

      expect(() => new Date(report.evaluatedAt)).not.toThrow();
      expect(new Date(report.evaluatedAt).getTime()).toBeGreaterThan(0);
    });

    it('CAT_B is WARNING (not FAILED) when no approved price books exist', async () => {
      prismaMock.commercialAccount.count.mockResolvedValue(1);
      prismaMock.priceBook.count.mockResolvedValue(0); // no approved price books
      prismaMock.reconciliationIssue.count.mockResolvedValue(0);
      prismaMock.commercialEvent.count.mockResolvedValue(0);

      const report = await service.generateGoLiveAuditReport();

      const catB = report.categories.find((c) => c.categoryCode === 'CAT_B');
      expect(catB?.status).toBe('WARNING');
      // WARNING does not block go-live per the service implementation
      expect(report.overallReadiness).toBe('READY_FOR_PRODUCTION');
    });
  });

  describe('generateGoLiveAuditReport — NOT_READY cases', () => {
    it('returns NOT_READY when critical reconciliation issues are open (CAT_D_P)', async () => {
      prismaMock.commercialAccount.count.mockResolvedValue(1);
      prismaMock.priceBook.count.mockResolvedValue(1);
      prismaMock.reconciliationIssue.count.mockResolvedValue(3); // 3 open critical issues
      prismaMock.commercialEvent.count.mockResolvedValue(0);

      const report = await service.generateGoLiveAuditReport();

      expect(report.overallReadiness).toBe('NOT_READY');
      const catDP = report.categories.find((c) => c.categoryCode === 'CAT_D_P');
      expect(catDP?.status).toBe('FAILED');
      expect(catDP?.verificationDetails).toContain('3');
    });

    it('passedCount excludes FAILED categories', async () => {
      prismaMock.commercialAccount.count.mockResolvedValue(1);
      prismaMock.priceBook.count.mockResolvedValue(1);
      prismaMock.reconciliationIssue.count.mockResolvedValue(2);
      prismaMock.commercialEvent.count.mockResolvedValue(0);

      const report = await service.generateGoLiveAuditReport();

      // CAT_D_P is FAILED, CAT_B is PASSED, CAT_A is PASSED, CAT_T is PASSED
      const failedCats = report.categories.filter((c) => c.status === 'FAILED');
      expect(failedCats.length).toBeGreaterThan(0);
      expect(report.passedCount).toBe(
        report.categories.filter((c) => c.status === 'PASSED').length,
      );
    });
  });

  describe('generateGoLiveAuditReport — determinism (idempotency)', () => {
    it('returns the same overallReadiness on consecutive calls with the same Prisma state', async () => {
      prismaMock.commercialAccount.count.mockResolvedValue(1);
      prismaMock.priceBook.count.mockResolvedValue(1);
      prismaMock.reconciliationIssue.count.mockResolvedValue(0);
      prismaMock.commercialEvent.count.mockResolvedValue(2);

      const first = await service.generateGoLiveAuditReport();
      const second = await service.generateGoLiveAuditReport();

      expect(first.overallReadiness).toBe(second.overallReadiness);
      expect(first.checksCount).toBe(second.checksCount);
      expect(first.passedCount).toBe(second.passedCount);
    });
  });

  describe('generateGoLiveAuditReport — category structure', () => {
    it('emits exactly four categories with required fields', async () => {
      prismaMock.commercialAccount.count.mockResolvedValue(1);
      prismaMock.priceBook.count.mockResolvedValue(1);
      prismaMock.reconciliationIssue.count.mockResolvedValue(0);
      prismaMock.commercialEvent.count.mockResolvedValue(1);

      const report = await service.generateGoLiveAuditReport();

      expect(report.categories).toHaveLength(4);
      for (const cat of report.categories) {
        expect(cat).toHaveProperty('categoryCode');
        expect(cat).toHaveProperty('categoryName');
        expect(cat).toHaveProperty('status');
        expect(cat).toHaveProperty('verificationDetails');
        expect(['PASSED', 'WARNING', 'FAILED']).toContain(cat.status);
      }
    });

    it('each categoryCode is unique (no duplicate audit categories)', async () => {
      prismaMock.commercialAccount.count.mockResolvedValue(1);
      prismaMock.priceBook.count.mockResolvedValue(1);
      prismaMock.reconciliationIssue.count.mockResolvedValue(0);
      prismaMock.commercialEvent.count.mockResolvedValue(1);

      const report = await service.generateGoLiveAuditReport();

      const codes = report.categories.map((c) => c.categoryCode);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });
  });
});
