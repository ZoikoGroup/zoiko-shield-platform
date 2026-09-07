import { Test, TestingModule } from '@nestjs/testing';
import {
  ClickHouseDetectorService,
  SecurityEventRecord,
} from './clickhouse-detector.service';
import { BadRequestException } from '@nestjs/common';

describe('LAB 09 — ClickHouse Analytical Detections & Parameterized SQL', () => {
  let detectorService: ClickHouseDetectorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClickHouseDetectorService],
    }).compile();

    detectorService = module.get<ClickHouseDetectorService>(
      ClickHouseDetectorService,
    );
  });

  describe('Query Plan Construction & Parameterization', () => {
    it('should generate strictly parameterized query without string concatenating tenant input', () => {
      const plan = detectorService.buildAnalyticalQueryPlan(
        'tenant-alpha',
        { start: '2026-09-01T00:00:00Z', end: '2026-09-07T00:00:00Z' },
        'actor-attacker-01',
        4,
      );

      expect(plan.query).toContain('WHERE tenant_id = {tenantId:String}');
      expect(plan.query).toContain('actor_id = {actorId:String}');
      expect(plan.params.tenantId).toBe('tenant-alpha');
      expect(plan.params.actorId).toBe('actor-attacker-01');
      expect(plan.partitionKey).toBe('tenant-alpha:202609');
      expect(plan.pscEndpoint).toBe(
        'clickhouse-psc.prod.zoikoshield.internal:8443',
      );

      // Crucial: query text must NEVER contain raw literal values
      expect(plan.query).not.toContain("'tenant-alpha'");
      expect(plan.query).not.toContain("'actor-attacker-01'");
    });

    it('should REJECT injection attempts in tenant identifier', () => {
      expect(() => {
        detectorService.buildAnalyticalQueryPlan("tenant-alpha' OR 1=1 --", {
          start: '2026-09-01T00:00:00Z',
          end: '2026-09-07T00:00:00Z',
        });
      }).toThrow(BadRequestException);
    });
  });

  describe('Tier-B Analytical Detection Execution', () => {
    it('should isolate analysis to target tenant events and produce signed detection candidate', () => {
      const mockEvents: SecurityEventRecord[] = [
        {
          tenantId: 'tenant-alpha',
          eventTime: '2026-09-07T08:00:00Z',
          eventId: 'evt-1',
          className: 'FILE_SYSTEM_ACTIVITY',
          activityId: 1,
          severity: 4,
          actorId: 'user-compromised',
          targetId: 'sensitive-db',
          payloadJson: '{}',
          schemaVersion: '1.0',
        },
        {
          tenantId: 'tenant-beta', // Another tenant's event
          eventTime: '2026-09-07T08:01:00Z',
          eventId: 'evt-2',
          className: 'FILE_SYSTEM_ACTIVITY',
          activityId: 1,
          severity: 5,
          actorId: 'user-beta',
          targetId: 'beta-db',
          payloadJson: '{}',
          schemaVersion: '1.0',
        },
      ];

      const plan = detectorService.buildAnalyticalQueryPlan('tenant-alpha', {
        start: '2026-09-01T00:00:00Z',
        end: '2026-09-07T00:00:00Z',
      });

      const result = detectorService.executeTierBDetection(plan, mockEvents);

      expect(result.tenantId).toBe('tenant-alpha');
      expect(result.matchedEventCount).toBe(1);
      expect(result.queryDigest).toHaveLength(64); // SHA-256
      expect(result.targetEntity).toBe('sensitive-db');
    });
  });
});
