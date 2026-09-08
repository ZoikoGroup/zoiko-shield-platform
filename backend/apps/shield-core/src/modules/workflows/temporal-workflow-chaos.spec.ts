import { Test, TestingModule } from '@nestjs/testing';
import { InvestigateAlertWorkflowService } from './investigate-alert-workflow.service';
import { TemporalWorkflowChaosService } from './temporal-workflow-chaos.service';

describe('TemporalWorkflowChaosService (LAB 10 & §13 Workflow Resilience)', () => {
  let workflowService: InvestigateAlertWorkflowService;
  let chaosService: TemporalWorkflowChaosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvestigateAlertWorkflowService,
        TemporalWorkflowChaosService,
      ],
    }).compile();

    workflowService = module.get<InvestigateAlertWorkflowService>(
      InvestigateAlertWorkflowService,
    );
    chaosService = module.get<TemporalWorkflowChaosService>(
      TemporalWorkflowChaosService,
    );
  });

  it('1. should preserve workflow state and replay deterministically across simulated worker crash', () => {
    const workflowId = 'wf-chaos-001';
    const tenantId = 'tenant-finance-01';

    // Start workflow
    const started = workflowService.startWorkflow({
      workflowId,
      tenantId,
      alertCandidateId: 'alert-sec-101',
      severity: 'CRITICAL',
      evidenceOpaquePointers: ['ev:ptr:001', 'ev:ptr:002'],
      targetResource: 'arn:aws:iam::123456789012:role/AdminRole',
    });

    expect(started.state).toBe('AWAITING_HUMAN_DECISION');

    // Record baseline events in durable journal
    chaosService.recordWorkflowEvent(workflowId, 'WORKFLOW_STARTED', { workflowId, tenantId });
    chaosService.recordWorkflowEvent(workflowId, 'EVIDENCE_GATHERED', { count: 2 });
    chaosService.recordWorkflowEvent(workflowId, 'PLAYBOOK_EVALUATED', { recommendation: 'CONTAIN_ROLE' });

    // Simulate worker hard crash
    const crashReport = chaosService.simulateWorkerCrash(workflowId);
    expect(crashReport.workerStatus).toBe('OFFLINE');
    expect(crashReport.lastPersistedEventId).toBe(3);

    // Recover worker and replay history
    const recoveryReport = chaosService.recoverWorkerAndReplayHistory(workflowId);
    expect(recoveryReport.determinismVerified).toBe(true);
    expect(recoveryReport.recoveredAtState).toBe('AWAITING_HUMAN_DECISION');
    expect(recoveryReport.historyDigestBefore).toBe(recoveryReport.historyDigestAfter);
    expect(recoveryReport.duplicateSideEffectsDetected).toBe(0);
  });

  it('2. should buffer asynchronous human approval signals during worker outage and process on restart', () => {
    const workflowId = 'wf-chaos-002';
    const tenantId = 'tenant-healthcare-02';

    workflowService.startWorkflow({
      workflowId,
      tenantId,
      alertCandidateId: 'alert-sec-102',
      severity: 'HIGH',
      evidenceOpaquePointers: ['ev:ptr:003'],
      targetResource: 'host-k8s-master-01',
    });

    chaosService.recordWorkflowEvent(workflowId, 'WORKFLOW_STARTED', { workflowId, tenantId });
    chaosService.recordWorkflowEvent(workflowId, 'EVIDENCE_GATHERED', { count: 1 });
    chaosService.recordWorkflowEvent(workflowId, 'PLAYBOOK_EVALUATED', { recommendation: 'ISOLATE_HOST' });

    // Worker crashes
    chaosService.simulateWorkerCrash(workflowId);

    // Operator sends human decision while worker is offline
    const signal = {
      decisionId: 'dec-chaos-999',
      workflowId,
      tenantId,
      authorizingPrincipal: 'secops-lead-alice',
      verdict: 'APPROVE_CONTAINMENT' as const,
      rationale: 'Confirmed credential stuffing attack from known malicious IP',
      timestamp: new Date().toISOString(),
    };

    const bufferResult = chaosService.receiveSignalDuringOutage(signal);
    expect(bufferResult.buffered).toBe(true);
    expect(bufferResult.queuePosition).toBe(1);

    // Worker restarts, replays history, and consumes buffered signal
    const recoveryReport = chaosService.recoverWorkerAndReplayHistory(workflowId);
    expect(recoveryReport.recoveredAtState).toBe('RESOLVED');
    expect(recoveryReport.determinismVerified).toBe(true);

    // Verify finalized workflow state in service
    const finalResult = workflowService.getWorkflowStatus(workflowId);
    expect(finalResult).toBeDefined();
    expect(finalResult!.state).toBe('RESOLVED');
    expect(finalResult!.executedActions).toContain('EXECUTE_ISOLATE_ENDPOINT_PLAYBOOK');
  });

  it('3. should execute activities idempotently across transient chaos retries without duplicate side-effects', async () => {
    const workflowId = 'wf-chaos-003';
    const activityName = 'quarantine-iam-principal';
    const idempotencyKey = 'idem-act-key-998877';

    // Execute with 2 transient failures before succeeding on attempt 3
    const result1 = await chaosService.executeActivityWithChaosRetry(
      workflowId,
      activityName,
      idempotencyKey,
      2,
    );

    expect(result1.executedSuccessfully).toBe(true);
    expect(result1.totalAttempts).toBe(3);
    expect(result1.sideEffectExecutedOnce).toBe(true);

    // Subsequent re-invocation with the same idempotency key must short-circuit
    const result2 = await chaosService.executeActivityWithChaosRetry(
      workflowId,
      activityName,
      idempotencyKey,
      0,
    );

    expect(result2.activityId).toBe(result1.activityId);
    expect(result2.executedSuccessfully).toBe(true);
    expect(result2.sideEffectExecutedOnce).toBe(true);
  });
});
