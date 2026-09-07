import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';

export type ControlComplianceState =
  | 'COMPLIANT'
  | 'NON_COMPLIANT'
  | 'STALE_EVIDENCE'
  | 'INCOMPLETE_DATA'
  | 'EVALUATION_ERROR';

export interface ControlEvaluationInput {
  controlId: string;
  tenantId: string;
  framework: 'SOC2_CC6_1' | 'ISO_27001_A_9_2' | 'HIPAA_164_312';
  evidenceCollectedAt: string;
  freshnessMaxSeconds: number;
  evidenceData: Record<string, unknown>;
}

export interface ControlEvaluationResult {
  evaluationId: string;
  controlId: string;
  tenantId: string;
  status: ControlComplianceState;
  reason: string;
  evidenceDigest: string;
  evaluatedAt: string;
}

describe('LAB 10 — Continuous Assurance Control Evaluator Engine', () => {
  function evaluateControl(
    input: ControlEvaluationInput,
  ): ControlEvaluationResult {
    const now = Date.now();
    const evidenceAgeSeconds =
      (now - new Date(input.evidenceCollectedAt).getTime()) / 1000;

    // 1. Freshness check (LAB 10 requirement: render explicit STALE state)
    if (evidenceAgeSeconds > input.freshnessMaxSeconds) {
      return {
        evaluationId: `eval-${Date.now()}`,
        controlId: input.controlId,
        tenantId: input.tenantId,
        status: 'STALE_EVIDENCE',
        reason: `Evidence age (${Math.round(evidenceAgeSeconds)}s) exceeds max freshness SLO (${input.freshnessMaxSeconds}s)`,
        evidenceDigest: 'stale-evidence-digest',
        evaluatedAt: new Date().toISOString(),
      };
    }

    // 2. Data completeness check (LAB 10 requirement: render explicit INCOMPLETE state)
    if (!input.evidenceData || Object.keys(input.evidenceData).length === 0) {
      return {
        evaluationId: `eval-${Date.now()}`,
        controlId: input.controlId,
        tenantId: input.tenantId,
        status: 'INCOMPLETE_DATA',
        reason:
          'Mandatory telemetry fields missing from evidence collector output',
        evidenceDigest: 'incomplete-data-digest',
        evaluatedAt: new Date().toISOString(),
      };
    }

    // 3. Concrete rule evaluation
    const isMfaEnforced = input.evidenceData.mfaEnforced === true;
    const adminCount = Number(input.evidenceData.standingAdminCount ?? 99);

    if (isMfaEnforced && adminCount <= 5) {
      return {
        evaluationId: `eval-${Date.now()}`,
        controlId: input.controlId,
        tenantId: input.tenantId,
        status: 'COMPLIANT',
        reason:
          'All control requirements satisfied: MFA enforced and standing admins <= 5',
        evidenceDigest: 'valid-evidence-sha256-hash',
        evaluatedAt: new Date().toISOString(),
      };
    }

    return {
      evaluationId: `eval-${Date.now()}`,
      controlId: input.controlId,
      tenantId: input.tenantId,
      status: 'NON_COMPLIANT',
      reason:
        'Standing admins exceed policy threshold or MFA not enforced on all accounts',
      evidenceDigest: 'non-compliant-evidence-digest',
      evaluatedAt: new Date().toISOString(),
    };
  }

  describe('Control State Transitions & Invariants', () => {
    it('should evaluate compliant control when evidence is fresh and policies are satisfied', () => {
      const result = evaluateControl({
        controlId: 'ctrl-soc2-mfa',
        tenantId: 'tenant-alpha',
        framework: 'SOC2_CC6_1',
        evidenceCollectedAt: new Date().toISOString(),
        freshnessMaxSeconds: 3600,
        evidenceData: { mfaEnforced: true, standingAdminCount: 2 },
      });

      expect(result.status).toBe('COMPLIANT');
      expect(result.reason).toContain('All control requirements satisfied');
    });

    it('should return STALE_EVIDENCE when telemetry exceeds freshness window (never falsely compliant)', () => {
      const result = evaluateControl({
        controlId: 'ctrl-soc2-mfa',
        tenantId: 'tenant-alpha',
        framework: 'SOC2_CC6_1',
        evidenceCollectedAt: new Date(Date.now() - 7200 * 1000).toISOString(), // 2 hours old
        freshnessMaxSeconds: 3600, // 1 hour max
        evidenceData: { mfaEnforced: true, standingAdminCount: 2 },
      });

      expect(result.status).toBe('STALE_EVIDENCE');
      expect(result.status).not.toBe('COMPLIANT');
    });

    it('should return INCOMPLETE_DATA when collector output is empty', () => {
      const result = evaluateControl({
        controlId: 'ctrl-soc2-mfa',
        tenantId: 'tenant-alpha',
        framework: 'SOC2_CC6_1',
        evidenceCollectedAt: new Date().toISOString(),
        freshnessMaxSeconds: 3600,
        evidenceData: {}, // Empty evidence
      });

      expect(result.status).toBe('INCOMPLETE_DATA');
    });
  });
});
