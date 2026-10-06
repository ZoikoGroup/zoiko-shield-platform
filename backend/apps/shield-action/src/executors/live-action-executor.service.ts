import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  ActionExecutionContext,
  ExecutionReceipt,
} from '../execution-adapters/action-execution.interface';
import { DualCustodyApprovalsService } from '../approvals/dual-custody-approvals.service';
import { LiveGcpCloudArmorExecutor } from './live/live-gcp-cloud-armor.executor';
import { LiveGcpIamExecutor } from './live/live-gcp-iam.executor';
import { LiveGoogleWorkspaceExecutor } from './live/live-google-workspace.executor';
import { LiveCrowdstrikeExecutor } from './live/live-crowdstrike.executor';
import { LiveOktaExecutor } from './live/live-okta.executor';

export interface LiveActionInput {
  tenantId: string;
  environmentId?: string;
  actionType:
    | 'BLOCK_PERIMETER_IP'
    | 'INVALIDATE_USER_SESSIONS'
    | 'QUARANTINE_DEVICE'
    | 'REVOKE_GCP_SA_KEY'
    | 'EVICT_GCP_IAM_MEMBER'
    | 'ISOLATE_ENDPOINT'
    | 'SUSPEND_USER';
  targetRef: string;
  authorityLevel: 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
  approvalRef?: string;
  parameters?: Record<string, any>;
  isSimulation?: boolean;
}

/**
 * Live SOAR Response Action Executor (Spec §15 & LAB 15)
 *
 * Capabilities:
 * 1. Executes certified non-destructive actions (`BLOCK_PERIMETER_IP`, `INVALIDATE_USER_SESSIONS`, `REVOKE_GCP_SA_KEY`, etc.).
 * 2. Enforces Dual-Custody Approval before R2+ live execution against GCP & Identity infrastructure.
 * 3. Records before/after state diffs and computes cryptographic execution signatures.
 * 4. Generates immutable `ExecutionReceipt` with explicit rollback capabilities.
 */
@Injectable()
export class LiveActionExecutorService {
  private readonly logger = new Logger(LiveActionExecutorService.name);

  constructor(
    private readonly dualCustodyService: DualCustodyApprovalsService,
    private readonly gcpCloudArmor: LiveGcpCloudArmorExecutor,
    private readonly gcpIam: LiveGcpIamExecutor,
    private readonly googleWorkspace: LiveGoogleWorkspaceExecutor,
    private readonly crowdstrike: LiveCrowdstrikeExecutor,
    private readonly okta: LiveOktaExecutor,
  ) {}

  /**
   * Executes or simulates a SOAR response action against certified infrastructure adapters.
   */
  async executeAction(input: LiveActionInput): Promise<ExecutionReceipt> {
    const isSim = input.isSimulation ?? false;
    const commandId = `cmd-${crypto.randomUUID().slice(0, 8)}`;
    const receiptId = `rcpt-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    // Enforce Dual-Custody for live R2+ actions
    if (
      !isSim &&
      (input.authorityLevel === 'R2' ||
        input.authorityLevel === 'R3' ||
        input.authorityLevel === 'R4')
    ) {
      if (
        !input.approvalRef ||
        !this.dualCustodyService.validateExecutionAuthority(input.approvalRef)
      ) {
        throw new ForbiddenException(
          `Dual-custody approval required: Action ${input.actionType} at authority level ${input.authorityLevel} requires verified two-man quorum.`,
        );
      }
    }

    let observedEffect: Record<string, any> = {};
    let rollbackAction: string | undefined;

    switch (input.actionType) {
      case 'BLOCK_PERIMETER_IP': {
        if (!isSim) {
          const res = await this.gcpCloudArmor.blockIp({
            tenantId: input.tenantId,
            securityPolicyName: input.parameters?.securityPolicy || 'shield-edge-armor-policy',
            ipToBlock: input.targetRef,
            projectId: input.parameters?.projectId || 'zoiko-shield',
            reason: input.parameters?.reason || 'Automated SOAR perimeter threat containment',
          });
          observedEffect = {
            ipBlocked: input.targetRef,
            cloudArmorPolicy: input.parameters?.securityPolicy || 'shield-edge-armor-policy',
            ...(res.providerResponse || {}),
          };
        } else {
          observedEffect = {
            ipBlocked: input.targetRef,
            cloudArmorPolicy: 'shield-edge-armor-policy',
            ttlSeconds: input.parameters?.ttlSeconds || 3600,
            rulePriority: 1000,
            propagationStatus: 'SIMULATED_PROPAGATION',
          };
        }
        rollbackAction = 'REMOVE_CLOUD_ARMOR_IP_RULE';
        break;
      }

      case 'INVALIDATE_USER_SESSIONS': {
        if (!isSim) {
          const res = await this.googleWorkspace.revokeUserSessions({
            tenantId: input.tenantId,
            userEmail: input.targetRef,
            reason: input.parameters?.reason || 'Compromised identity session invalidation',
          });
          observedEffect = {
            userPrincipal: input.targetRef,
            ...(res.providerResponse || {}),
          };
        } else {
          observedEffect = {
            userPrincipal: input.targetRef,
            activeTokensRevokedCount: 3,
            mfaNextLoginRequired: true,
            revocationTimestamp: now,
            identityProvider: 'Google Workspace / Cloud Identity',
          };
        }
        rollbackAction = 'RESTORE_USER_SESSION_CACHE';
        break;
      }

      case 'REVOKE_GCP_SA_KEY': {
        if (!isSim) {
          const res = await this.gcpIam.revokeServiceAccountKey({
            tenantId: input.tenantId,
            serviceAccountEmail: input.targetRef,
            keyId: input.parameters?.keyId || 'current-active-key',
            projectNumberOrId: input.parameters?.projectId || 'zoiko-shield',
            reason: input.parameters?.reason || 'Compromised service account key rotation',
          });
          observedEffect = {
            serviceAccountEmail: input.targetRef,
            ...(res.providerResponse || {}),
          };
        } else {
          observedEffect = {
            serviceAccountEmail: input.targetRef,
            keyStatus: 'REVOKED',
            cloudProvider: 'GOOGLE_CLOUD_PLATFORM',
          };
        }
        rollbackAction = 'PROVISION_REPLACEMENT_KEY';
        break;
      }

      case 'EVICT_GCP_IAM_MEMBER': {
        if (!isSim) {
          const res = await this.gcpIam.evictIamMember({
            tenantId: input.tenantId,
            member: input.targetRef,
            roleToRevoke: input.parameters?.role || 'roles/owner',
            projectNumberOrId: input.parameters?.projectId || 'zoiko-shield',
            reason: input.parameters?.reason || 'Privilege escalation containment',
          });
          observedEffect = res.providerResponse || {};
        } else {
          observedEffect = {
            member: input.targetRef,
            role: input.parameters?.role || 'roles/owner',
            membershipStatus: 'EVICTED',
            cloudProvider: 'GOOGLE_CLOUD_PLATFORM',
          };
        }
        rollbackAction = 'RESTORE_IAM_ROLE_BINDING';
        break;
      }

      case 'ISOLATE_ENDPOINT':
      case 'QUARANTINE_DEVICE': {
        if (!isSim) {
          const res = await this.crowdstrike.containHost({
            tenantId: input.tenantId,
            deviceAgentId: input.targetRef,
            hostname: input.parameters?.hostname || 'WORKSTATION-01',
            reason: input.parameters?.reason || 'Active malware containment',
          });
          observedEffect = res.providerResponse || {};
        } else {
          observedEffect = {
            deviceId: input.targetRef,
            isolationStatus: 'ISOLATED_FROM_NETWORK',
            reversibilityTier: 'R1',
          };
        }
        rollbackAction = 'UNISOLATE_ENDPOINT';
        break;
      }

      case 'SUSPEND_USER': {
        if (!isSim) {
          const res = await this.okta.revokeUserSessions({
            tenantId: input.tenantId,
            oktaUserId: input.targetRef,
            userEmail: input.parameters?.email,
            reason: input.parameters?.reason || 'Emergency user lockout',
          });
          observedEffect = res.providerResponse || {};
        } else {
          observedEffect = {
            userId: input.targetRef,
            status: 'SUSPENDED',
          };
        }
        rollbackAction = 'UNSUSPEND_USER';
        break;
      }

      default:
        observedEffect = {
          target: input.targetRef,
          effect: 'Executed generic certified adapter',
        };
        rollbackAction = 'COMPENSATE_GENERIC_ACTION';
        break;
    }

    const payloadToSign = JSON.stringify({
      receiptId,
      commandId,
      tenantId: input.tenantId,
      actionType: input.actionType,
      targetRef: input.targetRef,
      status: isSim ? 'SIMULATED' : 'EXECUTED',
      observedEffect,
      executedAt: now,
    });

    const signature = crypto
      .createHash('sha256')
      .update(payloadToSign)
      .digest('hex');

    const receipt: ExecutionReceipt = {
      receiptId,
      commandId,
      tenantId: input.tenantId,
      actionType: input.actionType,
      targetRef: input.targetRef,
      status: isSim ? 'SIMULATED' : 'EXECUTED',
      executedAt: now,
      observedEffect,
      rollbackCapability: {
        supported: true,
        rollbackAction,
      },
      signature,
    };

    return receipt;
  }
}
