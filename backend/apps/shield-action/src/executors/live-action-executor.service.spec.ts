import { Test, TestingModule } from '@nestjs/testing';
import { LiveActionExecutorService } from './live-action-executor.service';
import { DualCustodyApprovalsService } from '../approvals/dual-custody-approvals.service';
import { AutomatedRollbackOrchestratorService } from './automated-rollback-orchestrator.service';
import { ForbiddenException } from '@nestjs/common';

describe('LiveActionExecutor & DualCustody & Rollback (Spec §15 & LAB 15)', () => {
  let actionExecutor: LiveActionExecutorService;
  let dualCustodyService: DualCustodyApprovalsService;
  let rollbackService: AutomatedRollbackOrchestratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiveActionExecutorService,
        DualCustodyApprovalsService,
        AutomatedRollbackOrchestratorService,
      ],
    }).compile();

    actionExecutor = module.get<LiveActionExecutorService>(LiveActionExecutorService);
    dualCustodyService = module.get<DualCustodyApprovalsService>(DualCustodyApprovalsService);
    rollbackService = module.get<AutomatedRollbackOrchestratorService>(AutomatedRollbackOrchestratorService);
  });

  it('should allow single-analyst execution for R1 recommendation actions', async () => {
    const receipt = await actionExecutor.executeAction({
      tenantId: 'tenant-action-test',
      actionType: 'BLOCK_PERIMETER_IP',
      targetRef: '198.51.100.42',
      authorityLevel: 'R1',
      isSimulation: false,
    });

    expect(receipt.status).toBe('EXECUTED');
    expect(receipt.actionType).toBe('BLOCK_PERIMETER_IP');
    expect(receipt.observedEffect.ipBlocked).toBe('198.51.100.42');
    expect(receipt.rollbackCapability.supported).toBe(true);
    expect(receipt.rollbackCapability.rollbackAction).toBe('REMOVE_WAF_IP_RULE');
  });

  it('should enforce Dual-Custody Two-Man Rule for R2+ live actions', async () => {
    // 1. Without approval -> throws ForbiddenException
    await expect(
      actionExecutor.executeAction({
        tenantId: 'tenant-action-test',
        actionType: 'INVALIDATE_USER_SESSIONS',
        targetRef: 'compromised.admin@acme.com',
        authorityLevel: 'R2',
        isSimulation: false,
      }),
    ).rejects.toThrow(ForbiddenException);

    // 2. Initiated by Analyst Alice -> PENDING_APPROVAL
    const approval = dualCustodyService.initiateApproval(
      'tenant-action-test',
      'cmd-revoke-99',
      'INVALIDATE_USER_SESSIONS',
      'compromised.admin@acme.com',
      'R2',
      'analyst-alice',
      'SECURITY_ANALYST',
    );
    expect(approval.status).toBe('PENDING_APPROVAL');

    // 3. Analyst Alice cannot self-approve (segregation of duties)
    expect(() =>
      dualCustodyService.approveRequest(approval.approvalId, 'analyst-alice', 'SECURITY_ANALYST'),
    ).toThrow(ForbiddenException);

    // 4. Security Officer Bob approves -> APPROVED
    const approvedReq = dualCustodyService.approveRequest(
      approval.approvalId,
      'officer-bob',
      'SECURITY_OFFICER',
    );
    expect(approvedReq.status).toBe('APPROVED');

    // 5. Execution now succeeds
    const receipt = await actionExecutor.executeAction({
      tenantId: 'tenant-action-test',
      actionType: 'INVALIDATE_USER_SESSIONS',
      targetRef: 'compromised.admin@acme.com',
      authorityLevel: 'R2',
      approvalRef: approval.approvalId,
      isSimulation: false,
    });

    expect(receipt.status).toBe('EXECUTED');
    expect(receipt.observedEffect.userPrincipal).toBe('compromised.admin@acme.com');
  });

  it('should execute automated compensation rollback for executed action', async () => {
    const receipt = await actionExecutor.executeAction({
      tenantId: 'tenant-action-test',
      actionType: 'BLOCK_PERIMETER_IP',
      targetRef: '198.51.100.99',
      authorityLevel: 'R1',
      isSimulation: false,
    });

    const rollbackResult = await rollbackService.executeRollback(receipt);
    expect(rollbackResult.status).toBe('REVERTED');
    expect(rollbackResult.compensatingAction).toBe('REMOVE_WAF_IP_RULE');
    expect(rollbackResult.targetRef).toBe('198.51.100.99');
    expect(rollbackResult.stateRestorationProof.length).toBe(64);
  });
});
