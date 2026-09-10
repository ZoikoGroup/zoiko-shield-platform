import { Test, TestingModule } from '@nestjs/testing';
import { AssetIdentityContextService } from './asset-identity-context.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AssetIdentityContextService', () => {
  let service: AssetIdentityContextService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetIdentityContextService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<AssetIdentityContextService>(
      AssetIdentityContextService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('correlateActor', () => {
    it('correlates a standard user correctly', async () => {
      const context = await service.correlateActor(
        'tenant-1',
        'john.doe@company.com',
      );
      expect(context.actorType).toBe('USER');
      expect(context.criticalityTier).toBe('TIER_2_OPERATIONAL');
      expect(context.privilegedRoles).toEqual(['StandardUser']);
    });

    it('identifies privileged keywords and assigns TIER_0_MISSION_CRITICAL', async () => {
      const context = await service.correlateActor(
        'tenant-1',
        'secops-admin@company.com',
      );
      expect(context.criticalityTier).toBe('TIER_0_MISSION_CRITICAL');
      expect(context.privilegedRoles).toContain('SecurityAdmin');
    });

    it('identifies host principals correctly', async () => {
      const context = await service.correlateActor(
        'tenant-1',
        'srv-app-prod-01',
      );
      expect(context.actorType).toBe('HOST');
      expect(context.criticalityTier).toBe('TIER_1_BUSINESS_CRITICAL');
    });
  });

  describe('calculateBlastRadius', () => {
    it('calculates low risk for standard session reset', async () => {
      const assessment = await service.calculateBlastRadius({
        tenantId: 'tenant-1',
        actorId: 'developer@company.com',
        actionType: 'RESET_USER_SESSIONS',
      });

      expect(assessment.riskLevel).toBe('LOW');
      expect(assessment.score).toBeLessThan(0.45);
      expect(assessment.isSafeForAutomatedRecommendation).toBe(true);
      expect(assessment.rollbackCompensation.compensationActionType).toBe(
        'RESTORE_USER_SESSION_CACHE',
      );
    });

    it('calculates elevated risk and downtime scope for host isolation on mission critical service', async () => {
      const assessment = await service.calculateBlastRadius({
        tenantId: 'tenant-1',
        actorId: 'admin-root@company.com',
        actionType: 'ISOLATE_HOST',
        targetResource: 'srv-db-master',
      });

      expect(assessment.riskLevel).toBe('CRITICAL');
      expect(assessment.score).toBeGreaterThanOrEqual(0.7);
      expect(assessment.serviceDowntime).toBe('ISOLATED_HOST');
      expect(assessment.isSafeForAutomatedRecommendation).toBe(false);
      expect(assessment.rollbackCompensation.compensationActionType).toBe(
        'UNISOLATE_EDR_HOST',
      );
    });
  });

  describe('generateRollbackCompensation', () => {
    it('generates compensation for file quarantine', async () => {
      const context = await service.correlateActor(
        'tenant-1',
        'user@company.com',
      );
      const rollback = service.generateRollbackCompensation(
        'QUARANTINE_FILE',
        'sha256:abcd1234',
        context,
      );

      expect(rollback.compensationActionType).toBe('RESTORE_QUARANTINED_FILE');
      expect(rollback.isFullyAutomated).toBe(true);
      expect(rollback.estimatedReversalTimeSec).toBe(30);
    });
  });
});
