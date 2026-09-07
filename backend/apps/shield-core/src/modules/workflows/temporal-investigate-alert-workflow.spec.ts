import { Test, TestingModule } from '@nestjs/testing';
import {
  InvestigateAlertWorkflowService,
  InvestigationInput,
  HumanDecisionSignal,
} from './investigate-alert-workflow.service';

describe('LAB 10 — Temporal Case & Evidence Workflows', () => {
  let workflowService: InvestigateAlertWorkflowService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InvestigateAlertWorkflowService],
    }).compile();

    workflowService = module.get<InvestigateAlertWorkflowService>(
      InvestigateAlertWorkflowService,
    );
  });

  describe('Workflow Execution & Payload Minimization', () => {
    it('should start workflow with opaque evidence pointers and hold no raw customer payload in history', () => {
      const input: InvestigationInput = {
        workflowId: 'wf-case-9001',
        tenantId: 'tenant-alpha',
        alertCandidateId: 'alt-cand-1234',
        severity: 'HIGH',
        evidenceOpaquePointers: [
          'alloydb://cases/tenant-alpha/ev-001',
          'gcs://zs-evidence-vault/tenant-alpha/ev-002',
        ],
        targetResource: 'host-db-primary-01',
      };

      const result = workflowService.startWorkflow(input);
      expect(result.workflowId).toBe('wf-case-9001');
      expect(result.state).toBe('AWAITING_HUMAN_DECISION');

      const status = workflowService.getWorkflowStatus('wf-case-9001');
      expect(status).toBeDefined();
      expect(status!.history.length).toBeGreaterThanOrEqual(2);

      // Verify no raw customer text appears in history records
      const historyText = JSON.stringify(status!.history);
      expect(historyText).not.toContain('password');
      expect(historyText).not.toContain('secret');
      expect(historyText).toContain('alert:alt-cand-1234');
    });

    it('should be idempotent when starting with an existing workflowId', () => {
      const input: InvestigationInput = {
        workflowId: 'wf-case-9002',
        tenantId: 'tenant-alpha',
        alertCandidateId: 'alt-cand-5678',
        severity: 'LOW',
        evidenceOpaquePointers: ['alloydb://ev-003'],
        targetResource: 'user-bob',
      };

      const start1 = workflowService.startWorkflow(input);
      expect(start1.state).toBe('RESOLVED'); // Auto-resolved on LOW

      const start2 = workflowService.startWorkflow(input);
      expect(start2.state).toBe('RESOLVED');
      expect(start2.workflowId).toBe('wf-case-9002');
    });
  });

  describe('Human Authority Signal Method', () => {
    it('should transition workflow state upon receiving human containment decision signal', () => {
      const input: InvestigationInput = {
        workflowId: 'wf-case-9003',
        tenantId: 'tenant-alpha',
        alertCandidateId: 'alt-cand-9999',
        severity: 'CRITICAL',
        evidenceOpaquePointers: ['alloydb://ev-004'],
        targetResource: 'k8s-pod-auth-api',
      };

      workflowService.startWorkflow(input);

      const decision: HumanDecisionSignal = {
        decisionId: 'dec-soc-lead-01',
        workflowId: 'wf-case-9003',
        tenantId: 'tenant-alpha',
        authorizingPrincipal: 'soc-analyst-alice@zoiko.com',
        verdict: 'APPROVE_CONTAINMENT',
        rationale: 'Confirmed C2 beaconing activity.',
        timestamp: new Date().toISOString(),
      };

      const outcome = workflowService.recordHumanDecision(decision);

      expect(outcome.status).toBe('RESOLVED');
      expect(outcome.finalVerdict).toBe('APPROVE_CONTAINMENT');
      expect(outcome.executedActions).toContain(
        'EXECUTE_ISOLATE_ENDPOINT_PLAYBOOK',
      );
      expect(outcome.attestationDigest).toHaveLength(64);
    });

    it('should close workflow when human analyst dismisses alert as false positive', () => {
      const input: InvestigationInput = {
        workflowId: 'wf-case-9004',
        tenantId: 'tenant-alpha',
        alertCandidateId: 'alt-cand-8888',
        severity: 'MEDIUM',
        evidenceOpaquePointers: ['alloydb://ev-005'],
        targetResource: 'host-backup-server',
      };

      workflowService.startWorkflow(input);

      const decision: HumanDecisionSignal = {
        decisionId: 'dec-soc-lead-02',
        workflowId: 'wf-case-9004',
        tenantId: 'tenant-alpha',
        authorizingPrincipal: 'soc-analyst-bob@zoiko.com',
        verdict: 'DISMISS_FALSE_POSITIVE',
        rationale: 'Authorized scheduled backup job.',
        timestamp: new Date().toISOString(),
      };

      const outcome = workflowService.recordHumanDecision(decision);

      expect(outcome.status).toBe('CLOSED');
      expect(outcome.finalVerdict).toBe('DISMISS_FALSE_POSITIVE');
      expect(outcome.executedActions).toContain('TAG_FALSE_POSITIVE_TUNING');
    });
  });
});
