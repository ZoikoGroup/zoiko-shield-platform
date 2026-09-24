import {
  ServiceReadinessService,
  STATE_MEANINGS,
} from './service-readiness.service';
import { ServiceReadinessController } from './service-readiness.controller';
import { NotFoundException } from '@nestjs/common';

describe('ZS-ENG-OBS-001 §31: Explicit Service-Health & Readiness States Engine', () => {
  let service: ServiceReadinessService;
  let controller: ServiceReadinessController;

  beforeEach(() => {
    service = new ServiceReadinessService();
    controller = new ServiceReadinessController(service);
  });

  describe('1. 16 Canonical State Definitions (§31 Figure 13)', () => {
    it('verifies that all 16 canonical states have explicit required meanings', () => {
      const canonicalStates = [
        'HEALTHY',
        'AT_RISK',
        'DEGRADED',
        'PARTIAL_INCOMPLETE',
        'STALE',
        'UNKNOWN',
        'UNAVAILABLE',
        'UNAUTHORIZED',
        'QUARANTINED',
        'MAINTENANCE',
        'RECOVERING',
        'RECONCILIATION_REQUIRED',
        'ERROR_BUDGET_EXHAUSTED',
        'READINESS_CONDITIONAL',
        'NOT_READY',
        'WITHDRAWN',
      ];

      expect(Object.keys(STATE_MEANINGS).length).toBe(16);
      for (const state of canonicalStates) {
        expect(
          STATE_MEANINGS[state as keyof typeof STATE_MEANINGS],
        ).toBeDefined();
        expect(
          STATE_MEANINGS[state as keyof typeof STATE_MEANINGS].length,
        ).toBeGreaterThan(10);
      }
    });
  });

  describe('2. 6 Core Backend Services Evaluation (§31 & §32 V01)', () => {
    it('evaluates all 6 core platform services with healthy baseline', () => {
      const snapshot = service.evaluatePlatformReadiness({ g1Ratified: true });

      expect(snapshot.totalServicesCount).toBe(6);
      expect(snapshot.services['shield-core']).toBeDefined();
      expect(snapshot.services['shield-ingest']).toBeDefined();
      expect(snapshot.services['shield-ai']).toBeDefined();
      expect(snapshot.services['shield-action']).toBeDefined();
      expect(snapshot.services['shield-anchor']).toBeDefined();
      expect(snapshot.services['verifier-cli']).toBeDefined();

      expect(snapshot.overallState).toBe('HEALTHY');
      expect(snapshot.overallScore).toBe(1.0);
      expect(snapshot.healthyServicesCount).toBe(6);
      expect(snapshot.auditAttestationHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('returns individual service readiness details by ID', () => {
      const core = service.getServiceReadiness('shield-core');
      expect(core.serviceId).toBe('shield-core');
      expect(core.state).toBe('HEALTHY');
      expect(core.dependencies.length).toBeGreaterThanOrEqual(2);
      expect(core.signals.length).toBeGreaterThanOrEqual(3);

      expect(() => service.getServiceReadiness('unknown-service')).toThrow(
        NotFoundException,
      );
    });
  });

  describe('3. Dynamic G1 Launch Gate Linkage (§05, §16 & §31)', () => {
    it('sets shield-action to READINESS_CONDITIONAL when G1 is unratified (0/8)', () => {
      const snapshot = service.evaluatePlatformReadiness({ g1Ratified: false });

      expect(snapshot.g1GateRatified).toBe(false);
      expect(snapshot.services['shield-action'].state).toBe(
        'READINESS_CONDITIONAL',
      );
      expect(
        snapshot.services['shield-action'].operationalConditions?.length,
      ).toBeGreaterThan(0);
      expect(
        snapshot.services['shield-action'].operationalConditions?.[0],
      ).toContain('G1 Multi-Approver Launch Gate is PENDING');
      expect(snapshot.conditionalServicesCount).toBe(1);
      expect(snapshot.overallState).toBe('READINESS_CONDITIONAL');
    });

    it('transitions shield-action to HEALTHY when G1 is ratified (8/8)', () => {
      const snapshot = service.evaluatePlatformReadiness({ g1Ratified: true });

      expect(snapshot.g1GateRatified).toBe(true);
      expect(snapshot.services['shield-action'].state).toBe('HEALTHY');
      expect(snapshot.conditionalServicesCount).toBe(0);
      expect(snapshot.overallState).toBe('HEALTHY');
    });
  });

  describe('4. Infrastructure & Telemetry Degraded States (§31)', () => {
    it('transitions shield-core and platform to UNAVAILABLE when database is disconnected', () => {
      const snapshot = service.evaluatePlatformReadiness({
        dbConnected: false,
      });

      expect(snapshot.services['shield-core'].state).toBe('UNAVAILABLE');
      expect(snapshot.services['shield-core'].readinessScore).toBe(0.0);
      expect(snapshot.services['shield-core'].blockers).toContain(
        'Primary PostgreSQL / Prisma SOR database connection failed',
      );
      expect(snapshot.overallState).toBe('UNAVAILABLE');
    });

    it('transitions shield-anchor to UNAVAILABLE when Cloud KMS sovereign escrow fails', () => {
      const snapshot = service.evaluatePlatformReadiness({
        kmsConnected: false,
      });

      expect(snapshot.services['shield-anchor'].state).toBe('UNAVAILABLE');
      expect(snapshot.services['shield-anchor'].blockers).toContain(
        'Cloud KMS HSM sovereign key escrow unavailable',
      );
    });

    it('transitions shield-ingest to AT_RISK when ingestion lag exceeds 1000ms', () => {
      const snapshot = service.evaluatePlatformReadiness({
        ingestionLagMs: 2400,
      });

      expect(snapshot.services['shield-ingest'].state).toBe('AT_RISK');
      expect(snapshot.services['shield-ingest'].readinessScore).toBe(0.75);
      expect(snapshot.services['shield-ingest'].blockers[0]).toContain(
        'Ingestion stream lag (2400ms) exceeds SLA ceiling',
      );
    });
  });

  describe('5. Operational Administrative State Overrides', () => {
    it('allows setting and clearing manual administrative state overrides', () => {
      service.setServiceOverride(
        'shield-ai',
        'MAINTENANCE',
        'Scheduled model prompt calibration window',
      );

      const overridden = service.getServiceReadiness('shield-ai');
      expect(overridden.state).toBe('MAINTENANCE');
      expect(overridden.blockers).toContain(
        'Manual override: Scheduled model prompt calibration window',
      );

      service.clearServiceOverride('shield-ai');
      const cleared = service.getServiceReadiness('shield-ai');
      expect(cleared.state).toBe('HEALTHY');
    });
  });

  describe('6. Spec §26 Backup & Restore Drill Integration', () => {
    it('transitions shield-core to AT_RISK when backup is stale (>24h)', () => {
      const snapshot = service.evaluatePlatformReadiness({
        backupFresh: false,
      });

      expect(snapshot.services['shield-core'].state).toBe('AT_RISK');
      expect(snapshot.services['shield-core'].readinessScore).toBe(0.7);
      expect(snapshot.services['shield-core'].blockers).toContain(
        'Spec §26: Primary database backup is stale (>24h since last completed snapshot)',
      );
    });

    it('transitions shield-core to RECONCILIATION_REQUIRED when restore drill is unverified', () => {
      const snapshot = service.evaluatePlatformReadiness({
        restoreDrillVerified: false,
      });

      expect(snapshot.services['shield-core'].state).toBe(
        'RECONCILIATION_REQUIRED',
      );
      expect(snapshot.services['shield-core'].readinessScore).toBe(0.65);
      expect(snapshot.services['shield-core'].blockers).toContain(
        'Spec §26: Last database restore verification drill failed or exceeds 30-day threshold',
      );
    });
  });

  describe('7. REST Controller Endpoints', () => {
    it('exposes platform and service readiness via HTTP endpoints', () => {
      const full = controller.getPlatformReadiness('false', 'true', 'true');
      expect(full).toBeDefined();
      expect(full.totalServicesCount).toBe(6);

      const single = controller.getServiceReadiness('shield-anchor');
      expect(single.serviceId).toBe('shield-anchor');

      const override = controller.setServiceOverride('shield-core', {
        state: 'RECOVERING',
        reason: 'Failover re-sync',
      });
      expect(override.state).toBe('RECOVERING');

      const cleared = controller.clearServiceOverride('shield-core');
      expect(cleared.state).toBe('HEALTHY');
    });
  });

  describe('8. Spec §27 Synthetic Canary & Game Day Integration', () => {
    it('transitions shield-ingest to DEGRADED when synthetic canary probe fails', () => {
      const snapshot = service.evaluatePlatformReadiness({
        syntheticHealthy: false,
      });

      expect(snapshot.services['shield-ingest'].state).toBe('DEGRADED');
      expect(snapshot.services['shield-ingest'].readinessScore).toBe(0.7);
      expect(snapshot.services['shield-ingest'].blockers).toContain(
        'Spec §27: Synthetic canary journey probe degraded or SLA breached',
      );
    });

    it('transitions shield-action to RECONCILIATION_REQUIRED when game day is overdue (>90d)', () => {
      const snapshot = service.evaluatePlatformReadiness({
        g1Ratified: true,
        gameDayCompliant: false,
      });

      expect(snapshot.services['shield-action'].state).toBe(
        'RECONCILIATION_REQUIRED',
      );
      expect(
        snapshot.services['shield-action'].operationalConditions,
      ).toContain(
        'Spec §27: Scheduled Game Day resilience exercise is overdue (>90 days since last execution).',
      );
    });
  });
});
