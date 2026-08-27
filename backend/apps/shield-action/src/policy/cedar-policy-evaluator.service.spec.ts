import { CedarPolicyEvaluatorService } from './cedar-policy-evaluator.service';

describe('CedarPolicyEvaluatorService', () => {
  let evaluator: CedarPolicyEvaluatorService;

  beforeEach(() => {
    evaluator = new CedarPolicyEvaluatorService();
  });

  it('should default deny unregistered actions with no matching policy', () => {
    const res = evaluator.evaluate({
      principal: 'Role::"Unprivileged"',
      action: 'Action::"UNKNOWN_ACTION"',
      resource: 'Resource::"Database"',
      context: { tenantId: 'tenant-01' },
    });

    expect(res.decision).toBe('DENY');
    expect(res.reason).toContain('Explicit default deny');
  });

  it('should permit SecOps endpoint quarantine when threat severity is CRITICAL', () => {
    const res = evaluator.evaluate({
      principal: 'Role::"SecOpsAnalyst"',
      action: 'Action::"ISOLATE_ENDPOINT"',
      resource: 'Host::"PROD-WEB-01"',
      context: {
        tenantId: 'tenant-01',
        threatSeverity: 'CRITICAL',
      },
    });

    expect(res.decision).toBe('ALLOW');
    expect(res.matchedPolicies).toContain('cedar-pol-002');
  });

  it('should forbid critical cloud termination when approverCount < 2', () => {
    const res = evaluator.evaluate({
      principal: 'Role::"SecOpsAnalyst"',
      action: 'Action::"TERMINATE_CLOUD_INSTANCE"',
      resource: 'Cloud::"i-01928374"',
      context: {
        tenantId: 'tenant-01',
        approverCount: 1, // Insufficient for R4 quorum
      },
    });

    expect(res.decision).toBe('DENY');
    expect(res.reason).toContain('forbid policy triggered');
  });

  it('should permit all actions in simulation mode', () => {
    const res = evaluator.evaluate({
      principal: 'Role::"Auditor"',
      action: 'Action::"ANY_ACTION"',
      resource: 'Host::"TEST"',
      context: {
        tenantId: 'tenant-01',
        isSimulation: true,
      },
    });

    expect(res.decision).toBe('ALLOW');
    expect(res.matchedPolicies).toContain('cedar-pol-004');
  });
});
