import { Test, TestingModule } from '@nestjs/testing';
import { PhaseExitGateController } from './phase-exit-gate.controller';
import { PhaseExitGateService } from './phase-exit-gate.service';
import { PhaseProofExporterService } from './phase-proof-exporter.service';

describe('PhaseExitGateController (Spec §28 Endpoints)', () => {
  let controller: PhaseExitGateController;
  let exitGateService: PhaseExitGateService;
  let exporterService: PhaseProofExporterService;

  beforeEach(() => {
    exitGateService = new PhaseExitGateService();
    exporterService = new PhaseProofExporterService(exitGateService);
    controller = new PhaseExitGateController(exitGateService, exporterService);
  });

  it('GET /status returns posture summary and latest verified proof', async () => {
    const res = await controller.getPhase0Status();
    expect(res.postureSummary).toBeDefined();
    expect(res.postureSummary.isExitGateSatisfied).toBe(true);
    expect(res.latestProof).toBeDefined();
    expect(res.latestProof.overallStatus).toBe('PASSED');
  });

  it('POST /execute triggers on-demand reference flow and returns signed proof record', async () => {
    const proof = await controller.executePhase0Flow({
      tenantId: 'tenant-zoiko-canary-01',
      cellId: 'cell-eu-west-1a',
    });
    expect(proof.proofId).toBeDefined();
    expect(proof.stepsCompleted).toBe(8);
    expect(proof.criteriaSatisfied).toBe(6);
    expect(proof.overallStatus).toBe('PASSED');
  });

  it('GET /proof returns complete proof bundle with 8 leaves', async () => {
    const bundle = await controller.getPhase0ProofBundle();
    expect(bundle.manifest.packageId).toBeDefined();
    expect(bundle.merkleTreeData.leaves.length).toBe(8);
  });

  it('POST /verify validates proof bundle offline', async () => {
    const bundle = await controller.getPhase0ProofBundle();
    const verification = await controller.verifyProofOffline(bundle);
    expect(verification.verified).toBe(true);
    expect(verification.discrepancies.length).toBe(0);
  });
});
