import { Test, TestingModule } from '@nestjs/testing';
import { LiveActionExecutorService } from './live-action-executor.service';
import { DualCustodyQuorumService } from '../dual-custody/dual-custody-quorum.service';
import { AutomatedRollbackOrchestratorService } from './automated-rollback-orchestrator.service';
import { ForbiddenException } from '@nestjs/common';

import { LiveGcpCloudArmorExecutor } from './live/live-gcp-cloud-armor.executor';
import { LiveGcpIamExecutor } from './live/live-gcp-iam.executor';
import { LiveGoogleWorkspaceExecutor } from './live/live-google-workspace.executor';
import { LiveCrowdstrikeExecutor } from './live/live-crowdstrike.executor';
import { LiveOktaExecutor } from './live/live-okta.executor';

/** Minimal conditional-update fake for action.DualCustodyQuorum. */
function createFakeQuorumDb() {
  const rows = new Map<string, any>();
  const key = (t: string, q: string) => `${t}:${q}`;
  const matches = (row: any, where: any) =>
    Object.entries(where).every(([field, cond]: [string, any]) =>
      cond &&
      typeof cond === 'object' &&
      !(cond instanceof Date) &&
      'gt' in cond
        ? row[field] > cond.gt
        : cond && typeof cond === 'object' && 'in' in cond
          ? cond.in.includes(row[field])
          : row[field] === cond,
    );
  return {
    dualCustodyQuorum: {
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: 'dcq',
          secondary_approver: null,
          quorum_signature: null,
          finalized_at: null,
          consumed_at: null,
          ...data,
        };
        rows.set(key(data.tenant_id, data.quorum_id), row);
        return { ...row };
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const { tenant_id, quorum_id } = where.tenant_id_quorum_id;
        const row = rows.get(key(tenant_id, quorum_id));
        return row ? { ...row } : null;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const row of rows.values()) {
          if (matches(row, where)) {
            Object.assign(row, data);
            count++;
          }
        }
        return { count };
      }),
    },
  };
}

const approver = (userId: string) => ({
  userId,
  fullName: userId,
  role: 'SECURITY_OPERATIONS_LEAD' as const,
  fido2WebAuthnSignature: `fido2-${userId}`,
  signedAt: new Date().toISOString(),
});

describe('LiveActionExecutor & DualCustody & Rollback (Spec §15 & LAB 15)', () => {
  let actionExecutor: LiveActionExecutorService;
  let quorumService: DualCustodyQuorumService;
  let rollbackService: AutomatedRollbackOrchestratorService;

  const approve = async (
    actionType: 'BLOCK_PERIMETER_IP' | 'INVALIDATE_USER_SESSIONS',
    targetResource: string,
  ) => {
    const quorum = await quorumService.initiateQuorum({
      tenantId: 'tenant-action-test',
      environmentId: 'prod',
      caseId: 'case-1',
      proposalId: `prop-${targetResource}`,
      actionType,
      targetResource,
      authorityLevel: 'R2',
      blastRadiusScore: 0.2,
      reversibilityTier: 'R1',
      compensatingCommand: 'ROLLBACK',
      initiator: approver('analyst-alice'),
    });
    await quorumService.signSecondApproval(
      'tenant-action-test',
      quorum.quorumId,
      approver('officer-bob'),
    );
    return { quorumId: quorum.quorumId, proposalId: `prop-${targetResource}` };
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiveActionExecutorService,
        {
          provide: DualCustodyQuorumService,
          useValue: new DualCustodyQuorumService(createFakeQuorumDb() as any),
        },
        AutomatedRollbackOrchestratorService,
        LiveGcpCloudArmorExecutor,
        LiveGcpIamExecutor,
        LiveGoogleWorkspaceExecutor,
        LiveCrowdstrikeExecutor,
        LiveOktaExecutor,
      ],
    }).compile();

    actionExecutor = module.get(LiveActionExecutorService);
    quorumService = module.get(DualCustodyQuorumService);
    rollbackService = module.get(AutomatedRollbackOrchestratorService);
  });

  it('rejects a live destructive action whose caller declares R1 to skip dual custody', async () => {
    await expect(
      actionExecutor.executeAction({
        tenantId: 'tenant-action-test',
        actionType: 'BLOCK_PERIMETER_IP',
        targetRef: '198.51.100.42',
        authorityLevel: 'R1',
        isSimulation: false,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('simulates without approval', async () => {
    const receipt = await actionExecutor.executeAction({
      tenantId: 'tenant-action-test',
      actionType: 'BLOCK_PERIMETER_IP',
      targetRef: '198.51.100.42',
      authorityLevel: 'R1',
      isSimulation: true,
    });
    expect(receipt.status).toBe('SIMULATED');
  });

  it('executes once with a matching persisted quorum and refuses to reuse it', async () => {
    const approval = await approve(
      'INVALIDATE_USER_SESSIONS',
      'compromised.admin@acme.com',
    );
    const input = {
      tenantId: 'tenant-action-test',
      actionType: 'INVALIDATE_USER_SESSIONS' as const,
      targetRef: 'compromised.admin@acme.com',
      authorityLevel: 'R2' as const,
      approval,
      isSimulation: false,
    };

    const receipt = await actionExecutor.executeAction(input);
    expect(receipt.status).toBe('EXECUTED');
    expect(receipt.observedEffect.userPrincipal).toBe(
      'compromised.admin@acme.com',
    );

    await expect(actionExecutor.executeAction(input)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuses a quorum approved for a different target', async () => {
    const approval = await approve(
      'INVALIDATE_USER_SESSIONS',
      'someone.else@acme.com',
    );
    await expect(
      actionExecutor.executeAction({
        tenantId: 'tenant-action-test',
        actionType: 'INVALIDATE_USER_SESSIONS',
        targetRef: 'compromised.admin@acme.com',
        authorityLevel: 'R2',
        approval,
        isSimulation: false,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should execute automated compensation rollback for executed action', async () => {
    const receipt = await actionExecutor.executeAction({
      tenantId: 'tenant-action-test',
      actionType: 'BLOCK_PERIMETER_IP',
      targetRef: '198.51.100.99',
      authorityLevel: 'R2',
      approval: await approve('BLOCK_PERIMETER_IP', '198.51.100.99'),
      isSimulation: false,
    });

    const rollbackResult = await rollbackService.executeRollback(receipt);
    expect(rollbackResult.status).toBe('REVERTED');
    expect(rollbackResult.compensatingAction).toBe(
      'REMOVE_CLOUD_ARMOR_IP_RULE',
    );
    expect(rollbackResult.targetRef).toBe('198.51.100.99');
    expect(rollbackResult.stateRestorationProof.length).toBe(64);
  });
});
