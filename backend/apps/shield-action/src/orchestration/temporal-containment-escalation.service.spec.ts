import { TemporalContainmentEscalationService } from './temporal-containment-escalation.service';

describe('TemporalContainmentEscalationService (LAB 10 & 15 Multi-Approver Escalation)', () => {
  let escalationService: TemporalContainmentEscalationService;

  beforeEach(() => {
    escalationService = new TemporalContainmentEscalationService();
  });

  it('should start workflow and escalate to SOC Lead upon timeout', () => {
    const wf = escalationService.startContainmentWorkflow({
      workflowId: 'wf-inc-001',
      tenantId: 'tenant-bank-01',
      incidentRef: 'INC-2026-001',
      targetResource: 'srv-k8s-pod-01',
      actionType: 'ISOLATE_ENDPOINT',
      initialApprovalTier: 'TIER_1_SOC_ANALYST',
      analystApprovalTimeoutSeconds: 60,
    });

    expect(wf.currentState).toBe('AWAITING_ANALYST_APPROVAL');

    const escalated = escalationService.handleApprovalTimeout(wf.workflowId);
    expect(escalated.currentState).toBe('ESCALATED_TO_SOC_LEAD');
    expect(escalated.currentTier).toBe('TIER_2_SOC_LEAD');
  });

  it('should verify step-up MFA and resolve containment workflow', () => {
    const wf = escalationService.startContainmentWorkflow({
      workflowId: 'wf-inc-002',
      tenantId: 'tenant-bank-01',
      incidentRef: 'INC-2026-002',
      targetResource: 'user@bank.com',
      actionType: 'REVOKE_IAM_SESSION',
      initialApprovalTier: 'TIER_2_SOC_LEAD',
      analystApprovalTimeoutSeconds: 60,
    });

    const resolved = escalationService.recordApprovalWithStepUpMfa(
      wf.workflowId,
      'soc.lead@bank.com',
      'APPROVE',
      'fido2-hw-key-yubikey-5c-attested',
    );

    expect(resolved.currentState).toBe('RESOLVED');
    expect(resolved.mfaChallengeVerified).toBe(true);
    expect(resolved.actionReceiptId).toBeDefined();
  });

  it('should throw error when step-up MFA token is missing or invalid', () => {
    const wf = escalationService.startContainmentWorkflow({
      workflowId: 'wf-inc-003',
      tenantId: 'tenant-bank-01',
      incidentRef: 'INC-2026-003',
      targetResource: 'user@bank.com',
      actionType: 'REVOKE_IAM_SESSION',
      initialApprovalTier: 'TIER_2_SOC_LEAD',
      analystApprovalTimeoutSeconds: 60,
    });

    expect(() => {
      escalationService.recordApprovalWithStepUpMfa(
        wf.workflowId,
        'soc.lead@bank.com',
        'APPROVE',
        'invalid-software-token',
      );
    }).toThrow('Step-up FIDO2 MFA challenge failed');
  });
});
