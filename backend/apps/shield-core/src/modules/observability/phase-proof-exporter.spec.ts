import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PhaseExitGateService } from './phase-exit-gate.service';
import {
  PhaseProofExporterService,
  Phase0ProofBundle,
} from './phase-proof-exporter.service';

describe('PhaseProofExporterService (Spec §28 Proof Exporter & Offline Verifier)', () => {
  let service: PhaseProofExporterService;
  let exitGateService: PhaseExitGateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PhaseExitGateService, PhaseProofExporterService],
    }).compile();

    service = module.get<PhaseProofExporterService>(PhaseProofExporterService);
    exitGateService = module.get<PhaseExitGateService>(PhaseExitGateService);
  });

  it('should export a complete Spec §28 Phase-0 proof bundle with 8 Merkle leaves', () => {
    const bundle: Phase0ProofBundle = service.exportPhase0ProofBundle();

    expect(bundle).toBeDefined();
    expect(bundle.manifest.manifestVersion).toBe('1.0.0');
    expect(bundle.manifest.packageId).toMatch(/^pkg-phase0-/);
    expect(bundle.merkleTreeData.totalLeaves).toBe(8);
    expect(bundle.merkleTreeData.leaves.length).toBe(8);
    expect(bundle.merkleTreeData.witnessAttestation.signatureValid).toBe(true);
    expect(bundle.actionSandboxReceipt.liveMutationsCount).toBe(0);
    expect(bundle.actionSandboxReceipt.freezeSwitchFunctional).toBe(true);
    expect(bundle.offlineVerificationInstructions.expectedExitCode).toBe(0);
  });

  it('verifies a valid proof bundle offline with 100% invariant satisfaction', () => {
    const bundle = service.exportPhase0ProofBundle();
    const report = service.verifyProofBundleOffline(bundle);

    expect(report.verified).toBe(true);
    expect(report.invariantsPassed).toBe(report.totalInvariants);
    expect(report.merkleRootMatches).toBe(true);
    expect(report.evidenceChainIntact).toBe(true);
    expect(report.signatureMatches).toBe(true);
    expect(report.discrepancies.length).toBe(0);
    expect(report.verificationCertificate.certificateId).toMatch(/^cert-/);
    expect(report.verificationCertificate.verifierVersion).toBe('zoikoshield-verifier-v1.0');
  });

  it('detects tampering when Merkle root or live mutations are modified', () => {
    const bundle = service.exportPhase0ProofBundle();

    // Tamper with root hash
    const tamperedBundle: Phase0ProofBundle = {
      ...bundle,
      manifest: {
        ...bundle.manifest,
        merkleRootHead: '0000000000000000000000000000000000000000000000000000000000000000',
      },
      actionSandboxReceipt: {
        ...bundle.actionSandboxReceipt,
        liveMutationsCount: 5, // Violation of Phase-0 simulation constraint
      },
    };

    const report = service.verifyProofBundleOffline(tamperedBundle);

    expect(report.verified).toBe(false);
    expect(report.merkleRootMatches).toBe(false);
    expect(report.evidenceChainIntact).toBe(false);
    expect(report.discrepancies).toContain(
      'Manifest Merkle root does not match Merkle tree root hash',
    );
    expect(report.discrepancies).toContain(
      'Action sandbox reported uncontained live mutations in Phase-0 simulation',
    );
  });

  it('throws NotFoundException when an unknown proof ID is requested', () => {
    expect(() => service.exportPhase0ProofBundle('proof-non-existent-999')).toThrow(
      NotFoundException,
    );
  });
});
