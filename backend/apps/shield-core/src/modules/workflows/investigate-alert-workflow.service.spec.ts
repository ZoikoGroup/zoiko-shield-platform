import {
  InvestigateAlertWorkflowService,
  InvestigationInput,
  HumanDecisionSignal,
} from './investigate-alert-workflow.service';

describe('InvestigateAlertWorkflowService', () => {
  let workflowService: InvestigateAlertWorkflowService;

  beforeEach(() => {
    workflowService = new InvestigateAlertWorkflowService();
  });

  it('should initialize workflow and transition to AWAITING_HUMAN_DECISION for high severity alerts', () => {
    const input: InvestigationInput = {
      workflowId: 'wf-investigation-001',
      tenantId: 'tenant-enterprise-01',
      alertCandidateId: 'cand-9988',
      severity: 'CRITICAL',
      evidenceOpaquePointers: ['gcs://zs-evidence-eu/sha256-a1b2c3d4', 'alloydb://events/row-1002'],
      targetResource: 'host-k8s-node-09',
    };

    const init = workflowService.startWorkflow(input);
    expect(init.workflowId).toBe('wf-investigation-001');
    expect(init.state).toBe('AWAITING_HUMAN_DECISION');

    // Test Signal handling: Human approves containment
    const signal: HumanDecisionSignal = {
      decisionId: 'dec-01',
      workflowId: 'wf-investigation-001',
      tenantId: 'tenant-enterprise-01',
      authorizingPrincipal: 'soc.lead@enterprise-bank.com',
      verdict: 'APPROVE_CONTAINMENT',
      rationale: 'Confirmed lateral movement pattern via CrowdStrike and eBPF',
      timestamp: new Date().toISOString(),
    };

    const result = workflowService.recordHumanDecision(signal);
    expect(result.status).toBe('RESOLVED');
    expect(result.finalVerdict).toBe('APPROVE_CONTAINMENT');
    expect(result.executedActions).toContain('EXECUTE_ISOLATE_ENDPOINT_PLAYBOOK');
    expect(result.historyRecordCount).toBeGreaterThanOrEqual(4);
  });

  it('should auto-resolve low severity alert workflows without human blocking', () => {
    const input: InvestigationInput = {
      workflowId: 'wf-low-002',
      tenantId: 'tenant-enterprise-01',
      alertCandidateId: 'cand-0011',
      severity: 'LOW',
      evidenceOpaquePointers: ['gcs://zs-evidence-eu/sha256-0000'],
      targetResource: 'dev-container-test',
    };

    const init = workflowService.startWorkflow(input);
    expect(init.state).toBe('RESOLVED');
  });
});
