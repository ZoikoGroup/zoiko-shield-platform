import { Test, TestingModule } from '@nestjs/testing';
import {
  PhaseExitGateService,
  Phase0ExitProofRecord,
} from './phase-exit-gate.service';

describe('PhaseExitGateService (Spec §28 Phase-0 Exit Gate Engine)', () => {
  let service: PhaseExitGateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PhaseExitGateService],
    }).compile();

    service = module.get<PhaseExitGateService>(PhaseExitGateService);
  });

  it('should be defined and seeded with an initial verified Phase-0 reference proof', () => {
    expect(service).toBeDefined();
    const latest = service.getLatestProof();
    expect(latest).toBeDefined();
    expect(latest.overallStatus).toBe('PASSED');
    expect(latest.stepsCompleted).toBe(8);
    expect(latest.totalSteps).toBe(8);
  });

  it('executes full 8-step Phase-0 vertical reference flow per Spec §28', () => {
    const proof: Phase0ExitProofRecord = service.executePhase0ReferenceFlow(
      'tenant-zoiko-canary-01',
      'cell-eu-west-1a',
    );

    expect(proof.proofId).toMatch(/^phase0-proof-/);
    expect(proof.phaseVersion).toBe('Phase-0-ERB-01');
    expect(proof.overallStatus).toBe('PASSED');
    expect(proof.steps.length).toBe(8);
    expect(proof.criteria.length).toBe(6);

    // Verify all 8 individual steps
    const stepIds = proof.steps.map((s) => s.stepId);
    expect(stepIds).toEqual([
      'STEP_1_TENANT_PROVISIONING',
      'STEP_2_AUTHENTICATED_INGESTION',
      'STEP_3_DETERMINISTIC_DETECTION',
      'STEP_4_EVIDENCE_AND_CONTROL',
      'STEP_5_AUDIT_PACKAGE_MERKLE',
      'STEP_6_WITNESS_ANCHOR_PROOF',
      'STEP_7_ACTION_SIMULATION',
      'STEP_8_FREEZE_ASSERTION',
    ]);

    proof.steps.forEach((step) => {
      expect(step.passed).toBe(true);
      expect(step.evidenceDigest).toBeDefined();
      expect(step.durationMs).toBeGreaterThanOrEqual(0);
    });

    // Step 7 must confirm 0 live mutations in simulation mode
    const step7 = proof.steps.find(
      (s) => s.stepId === 'STEP_7_ACTION_SIMULATION',
    );
    expect(step7?.outputArtifacts.mutationsApplied).toBe(0);
    expect(step7?.outputArtifacts.blastRadiusTier).toBe('CONFINED_SINGLE_USER');

    // Step 8 must verify freeze switch functionality
    const step8 = proof.steps.find(
      (s) => s.stepId === 'STEP_8_FREEZE_ASSERTION',
    );
    expect(step8?.outputArtifacts.freezeSwitchFunctional).toBe(true);
    expect(step8?.outputArtifacts.failSafeModeActive).toBe(true);
  });

  it('satisfies all 6 Spec §28 Exit Gate criteria with verified invariants', () => {
    const proof = service.executePhase0ReferenceFlow();

    expect(proof.criteriaSatisfied).toBe(6);
    expect(proof.totalCriteria).toBe(6);

    const criteriaIds = proof.criteria.map((c) => c.criteriaId);
    expect(criteriaIds).toContain('CRIT_01_SYNTHETIC_TENANT_ISOLATION');
    expect(criteriaIds).toContain('CRIT_02_DETERMINISTIC_DETECTION_VERIFIED');
    expect(criteriaIds).toContain('CRIT_03_EVIDENCE_MERKLE_ANCHORED');
    expect(criteriaIds).toContain('CRIT_04_OFFLINE_VERIFIER_COMPLIANT');
    expect(criteriaIds).toContain('CRIT_05_ACTION_SIMULATION_CONSTRAINED');
    expect(criteriaIds).toContain('CRIT_06_EMERGENCY_FREEZE_VERIFIED');

    proof.criteria.forEach((crit) => {
      expect(crit.status).toBe('PASSED');
      expect(crit.requiredInvariants.length).toBeGreaterThan(0);
    });
  });

  it('computes cryptographic SHA-256 attestation signature and offline verification command', () => {
    const proof = service.executePhase0ReferenceFlow();

    expect(proof.cryptographicProofSignatureSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(proof.merkleRootHead).toMatch(/^[a-f0-9]{64}$/);
    expect(proof.auditPackageChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(proof.offlineVerificationCommand).toContain(
      'npx zoikoshield-verifier verify-proof',
    );
    expect(proof.offlineVerificationCommand).toContain(proof.merkleRootHead);
    expect(proof.releaseGateRatification.eligibleForG1Gate).toBe(true);
  });

  it('retrieves posture summary and past proofs by ID', () => {
    const proof = service.executePhase0ReferenceFlow(
      'tenant-zoiko-canary-custom',
      'cell-us-east-1',
    );
    const summary = service.getPostureSummary();

    expect(summary.isExitGateSatisfied).toBe(true);
    expect(summary.overallStatus).toBe('PASSED');
    expect(summary.latestProofId).toBe(proof.proofId);
    expect(summary.offlineVerificationReady).toBe(true);

    const fetched = service.getProofById(proof.proofId);
    expect(fetched).toBeDefined();
    expect(fetched?.targetTenantId).toBe('tenant-zoiko-canary-custom');
  });
});
