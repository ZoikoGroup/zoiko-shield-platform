import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import type { DualCustodyQuorum } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { runWithTenantScope } from '../../../../libs/database/src';

export interface ApproverIdentity {
  userId: string;
  fullName: string;
  role: 'SECURITY_OPERATIONS_LEAD' | 'TENANT_OWNER' | 'INCIDENT_COMMANDER';
  fido2WebAuthnSignature: string;
  signedAt: string;
}

// Executors pass their own action name; it must equal the approved one exactly.
export type DualCustodyActionType =
  | 'REVOKE_IAM_SESSION'
  | 'ISOLATE_ENDPOINT'
  | 'DISABLE_USER_ACCOUNT'
  | 'QUARANTINE_FILE'
  | 'APPLY_WAF_BLOCK'
  | 'ISOLATE_HOST_NETWORK'
  | 'TERMINATE_MALICIOUS_PROCESS'
  | 'QUARANTINE_FILE_PAYLOAD'
  | 'QUARANTINE_POD_NETWORK'
  | 'BLOCK_PERIMETER_IP'
  | 'INVALIDATE_USER_SESSIONS'
  | 'QUARANTINE_DEVICE'
  | 'REVOKE_GCP_SA_KEY'
  | 'EVICT_GCP_IAM_MEMBER'
  | 'SUSPEND_USER';

export const MAX_QUORUM_TTL_MINUTES = 15;

export interface DualCustodyApprovalRef {
  quorumId: string;
  proposalId: string;
}

export interface DualCustodyQuorumRequest {
  quorumId?: string;
  tenantId: string;
  environmentId: string;
  caseId: string;
  proposalId: string;
  actionType: DualCustodyActionType;
  targetResource: string;
  authorityLevel: 'R2' | 'R3' | 'R4';
  blastRadiusScore: number;
  reversibilityTier: 'R1' | 'R2';
  compensatingCommand: string;
  initiator: ApproverIdentity;
  ttlMinutes?: number;
}

export interface DualCustodyQuorumReceipt {
  quorumId: string;
  tenantId: string;
  environmentId: string;
  caseId: string;
  proposalId: string;
  actionType: string;
  targetResource: string;
  authorityLevel: string;
  status:
    | 'PENDING_SECOND_SIGNATURE'
    | 'QUORUM_REACHED'
    | 'CONSUMED'
    | 'REJECTED'
    | 'EXPIRED';
  initiator: ApproverIdentity;
  secondaryApprover?: ApproverIdentity;
  quorumSignature?: string;
  singleUseRollbackToken: string;
  compensatingPlan: {
    rollbackCommand: string;
    targetResource: string;
    reversibilityTier: string;
  };
  createdAt: string;
  expiresAt: string;
  finalizedAt?: string;
}

/**
 * Dual-Custody Cryptographic Quorum Service
 * Architecture: ADR-04 (Dual-Custody Cryptographic Quorum)
 *
 * State lives in action.DualCustodyQuorum, so a pending second signature
 * survives restarts and every instance sees the same quorum.
 */
@Injectable()
export class DualCustodyQuorumService {
  private readonly logger = new Logger(DualCustodyQuorumService.name);
  private readonly secretKey =
    process.env.DUAL_CUSTODY_SECRET_KEY ||
    'zs-dual-custody-quantum-secret-2026';

  constructor(private readonly prisma: PrismaService) {
    if (
      process.env.NODE_ENV === 'production' &&
      !process.env.DUAL_CUSTODY_SECRET_KEY
    ) {
      throw new Error(
        'FATAL: DUAL_CUSTODY_SECRET_KEY environment variable is required in production mode for cryptographic quorum attestations.',
      );
    }
  }

  /**
   * Initiates a new Dual-Custody Approval Quorum for live R2/R3/R4 containment actions.
   */
  async initiateQuorum(
    request: DualCustodyQuorumRequest,
  ): Promise<DualCustodyQuorumReceipt> {
    if (
      !request.tenantId ||
      !request.initiator?.userId ||
      !request.proposalId
    ) {
      throw new BadRequestException(
        'Missing required parameters: tenantId, proposalId, and initiator are mandatory.',
      );
    }

    if (!request.initiator.fido2WebAuthnSignature) {
      throw new ForbiddenException(
        'Initiator must provide valid FIDO2 / WebAuthn hardware attestation token.',
      );
    }

    const ttlMinutes = Math.min(
      request.ttlMinutes ?? MAX_QUORUM_TTL_MINUTES,
      MAX_QUORUM_TTL_MINUTES,
    );
    if (!(ttlMinutes > 0)) {
      throw new BadRequestException('ttlMinutes must be a positive number.');
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
    const quorumId = request.quorumId || `quorum-${crypto.randomUUID()}`;
    const singleUseRollbackToken = `ZS-ROLLBACK-TOKEN-${crypto.randomUUID()}`;

    const row = await runWithTenantScope(request.tenantId, () =>
      this.prisma.dualCustodyQuorum.create({
        data: {
          tenant_id: request.tenantId,
          quorum_id: quorumId,
          environment_id: request.environmentId || 'production',
          case_id: request.caseId,
          proposal_id: request.proposalId,
          action_type: request.actionType,
          target_resource: request.targetResource,
          authority_level: request.authorityLevel,
          status: 'PENDING_SECOND_SIGNATURE',
          initiator: JSON.stringify(request.initiator),
          single_use_rollback_token: singleUseRollbackToken,
          compensating_plan: JSON.stringify({
            rollbackCommand: request.compensatingCommand,
            targetResource: request.targetResource,
            reversibilityTier: request.reversibilityTier,
          }),
          created_at: now,
          expires_at: expiresAt,
        },
      }),
    );

    this.logger.log(
      `✔ [DUAL-CUSTODY QUORUM INITIATED] Quorum '${quorumId}' for proposal '${request.proposalId}' by '${request.initiator.fullName}'`,
    );

    return this.toReceipt(row);
  }

  /**
   * Attests secondary signature to finalize dual-custody approval quorum.
   */
  async signSecondApproval(
    tenantId: string,
    quorumId: string,
    approver: ApproverIdentity,
  ): Promise<DualCustodyQuorumReceipt> {
    return runWithTenantScope(tenantId, async () => {
      const quorum = await this.findRow(tenantId, quorumId);
      if (!quorum) {
        throw new NotFoundException(
          `Dual-custody quorum '${quorumId}' not found for tenant '${tenantId}'.`,
        );
      }

      if (Date.now() > quorum.expires_at.getTime()) {
        await this.markExpired(tenantId, quorumId);
        this.logger.warn(
          `🛑 [DUAL-CUSTODY EXPIRED] Quorum '${quorumId}' expired.`,
        );
        throw new BadRequestException(
          `Dual-custody quorum '${quorumId}' has expired.`,
        );
      }

      if (quorum.status !== 'PENDING_SECOND_SIGNATURE') {
        throw new BadRequestException(
          `Cannot sign quorum '${quorumId}' with status '${quorum.status}'.`,
        );
      }

      const initiator = JSON.parse(quorum.initiator) as ApproverIdentity;

      // NON-NEGOTIABLE RULE: Secondary approver MUST be distinct from initiator
      if (approver.userId === initiator.userId) {
        this.logger.error(
          `🚨 [DUAL-CUSTODY VIOLATION] Operator '${approver.userId}' attempted self-approval!`,
        );
        throw new ForbiddenException(
          `Dual-Custody Violation: Initiator '${initiator.fullName}' cannot self-approve their own containment action.`,
        );
      }

      if (!approver.fido2WebAuthnSignature) {
        throw new ForbiddenException(
          'Secondary approver must provide valid FIDO2 / WebAuthn hardware attestation token.',
        );
      }

      const finalizedAt = new Date();
      const quorumSignature = this.sign(quorum, approver.userId, finalizedAt);

      // Only the update that still finds the quorum pending and unexpired
      // wins; a concurrent second approver matches zero rows.
      const { count } = await this.prisma.dualCustodyQuorum.updateMany({
        where: {
          tenant_id: tenantId,
          quorum_id: quorumId,
          status: 'PENDING_SECOND_SIGNATURE',
          expires_at: { gt: finalizedAt },
        },
        data: {
          status: 'QUORUM_REACHED',
          secondary_approver: JSON.stringify(approver),
          quorum_signature: quorumSignature,
          finalized_at: finalizedAt,
        },
      });

      if (count !== 1) {
        throw new BadRequestException(
          `Cannot sign quorum '${quorumId}': it was finalized or expired concurrently.`,
        );
      }

      this.logger.log(
        `✔ [DUAL-CUSTODY QUORUM REACHED] Action '${quorum.action_type}' approved by '${initiator.fullName}' & '${approver.fullName}' (Signature: ${quorumSignature.slice(0, 16)}...)`,
      );

      const finalized = await this.findRow(tenantId, quorumId);
      return this.toReceipt(finalized!);
    });
  }

  /**
   * Validates whether an action proposal has a finalized, unexpired dual-custody signature.
   */
  async validateQuorumForExecution(
    tenantId: string,
    quorumId: string,
    proposalId: string,
  ): Promise<{
    valid: boolean;
    reason?: string;
    receipt?: DualCustodyQuorumReceipt;
  }> {
    return runWithTenantScope(tenantId, async () => {
      const quorum = await this.findRow(tenantId, quorumId);

      if (!quorum) {
        return { valid: false, reason: `Quorum '${quorumId}' not found.` };
      }

      if (quorum.proposal_id !== proposalId) {
        return {
          valid: false,
          reason: `Quorum proposal '${quorum.proposal_id}' does not match requested proposal '${proposalId}'.`,
        };
      }

      if (quorum.status !== 'QUORUM_REACHED') {
        return {
          valid: false,
          reason: `Quorum status is '${quorum.status}', expected 'QUORUM_REACHED'.`,
        };
      }

      if (Date.now() > quorum.expires_at.getTime()) {
        await this.markExpired(tenantId, quorumId);
        return { valid: false, reason: `Quorum '${quorumId}' has expired.` };
      }

      if (
        !quorum.quorum_signature ||
        !quorum.secondary_approver ||
        !quorum.finalized_at
      ) {
        return {
          valid: false,
          reason:
            'Quorum is missing cryptographic quorum signature or secondary approver.',
        };
      }

      // The row is now durable, so a direct database write could forge a
      // QUORUM_REACHED status. The HMAC is recomputed rather than trusted.
      const approver = JSON.parse(
        quorum.secondary_approver,
      ) as ApproverIdentity;
      const expected = Buffer.from(
        this.sign(quorum, approver.userId, quorum.finalized_at),
        'hex',
      );
      const stored = Buffer.from(quorum.quorum_signature, 'hex');
      if (
        expected.length !== stored.length ||
        !crypto.timingSafeEqual(expected, stored)
      ) {
        this.logger.error(
          `🚨 [DUAL-CUSTODY TAMPER] Quorum '${quorumId}' signature does not verify.`,
        );
        return {
          valid: false,
          reason: 'Quorum signature does not verify.',
        };
      }

      return { valid: true, receipt: this.toReceipt(quorum) };
    });
  }

  /**
   * Gate for every live destructive dispatch: the quorum must verify, match
   * this exact tenant/action/target, and is consumed so one approval
   * authorizes exactly one execution.
   */
  async consumeForExecution(
    tenantId: string,
    approval: DualCustodyApprovalRef | undefined,
    actionType: DualCustodyActionType,
    targetResource: string,
  ): Promise<DualCustodyQuorumReceipt> {
    if (!tenantId || !approval?.quorumId || !approval?.proposalId) {
      throw new ForbiddenException(
        `Dual-custody approval required: ${actionType} on '${targetResource}' needs a quorumId and proposalId.`,
      );
    }

    const result = await this.validateQuorumForExecution(
      tenantId,
      approval.quorumId,
      approval.proposalId,
    );
    if (!result.valid || !result.receipt) {
      throw new ForbiddenException(
        `Dual-custody approval rejected: ${result.reason ?? 'quorum invalid'}`,
      );
    }
    if (
      result.receipt.actionType !== actionType ||
      result.receipt.targetResource !== targetResource
    ) {
      this.logger.error(
        `🚨 [DUAL-CUSTODY MISMATCH] Quorum '${approval.quorumId}' approved ${result.receipt.actionType} on '${result.receipt.targetResource}', not ${actionType} on '${targetResource}'.`,
      );
      throw new ForbiddenException(
        'Dual-custody approval does not cover this action and target.',
      );
    }

    const consumedAt = new Date();
    const { count } = await runWithTenantScope(tenantId, () =>
      this.prisma.dualCustodyQuorum.updateMany({
        where: {
          tenant_id: tenantId,
          quorum_id: approval.quorumId,
          status: 'QUORUM_REACHED',
          consumed_at: null,
          expires_at: { gt: consumedAt },
        },
        data: { status: 'CONSUMED', consumed_at: consumedAt },
      }),
    );
    if (count !== 1) {
      throw new ForbiddenException(
        `Dual-custody quorum '${approval.quorumId}' was already used or expired.`,
      );
    }

    return result.receipt;
  }

  async getQuorum(
    tenantId: string,
    quorumId: string,
  ): Promise<DualCustodyQuorumReceipt> {
    const quorum = await runWithTenantScope(tenantId, () =>
      this.findRow(tenantId, quorumId),
    );
    if (!quorum) {
      throw new NotFoundException(
        `Quorum '${quorumId}' not found for tenant '${tenantId}'.`,
      );
    }
    return this.toReceipt(quorum);
  }

  private findRow(
    tenantId: string,
    quorumId: string,
  ): Promise<DualCustodyQuorum | null> {
    return this.prisma.dualCustodyQuorum.findUnique({
      where: {
        tenant_id_quorum_id: { tenant_id: tenantId, quorum_id: quorumId },
      },
    });
  }

  private async markExpired(tenantId: string, quorumId: string): Promise<void> {
    await this.prisma.dualCustodyQuorum.updateMany({
      where: {
        tenant_id: tenantId,
        quorum_id: quorumId,
        status: { in: ['PENDING_SECOND_SIGNATURE', 'QUORUM_REACHED'] },
      },
      data: { status: 'EXPIRED' },
    });
  }

  /** ZS-QUORUM-RECEIPT-V1 */
  private sign(
    quorum: DualCustodyQuorum,
    approverId: string,
    finalizedAt: Date,
  ): string {
    const initiator = JSON.parse(quorum.initiator) as ApproverIdentity;
    const signaturePayload = {
      version: 'ZS-QUORUM-RECEIPT-V1',
      quorumId: quorum.quorum_id,
      tenantId: quorum.tenant_id,
      proposalId: quorum.proposal_id,
      actionType: quorum.action_type,
      targetResource: quorum.target_resource,
      initiatorId: initiator.userId,
      approverId,
      singleUseRollbackToken: quorum.single_use_rollback_token,
      finalizedAt: finalizedAt.toISOString(),
    };
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(JSON.stringify(signaturePayload))
      .digest('hex');
  }

  private toReceipt(row: DualCustodyQuorum): DualCustodyQuorumReceipt {
    return {
      quorumId: row.quorum_id,
      tenantId: row.tenant_id,
      environmentId: row.environment_id,
      caseId: row.case_id,
      proposalId: row.proposal_id,
      actionType: row.action_type,
      targetResource: row.target_resource,
      authorityLevel: row.authority_level,
      status: row.status as DualCustodyQuorumReceipt['status'],
      initiator: JSON.parse(row.initiator) as ApproverIdentity,
      secondaryApprover: row.secondary_approver
        ? (JSON.parse(row.secondary_approver) as ApproverIdentity)
        : undefined,
      quorumSignature: row.quorum_signature ?? undefined,
      singleUseRollbackToken: row.single_use_rollback_token,
      compensatingPlan: JSON.parse(
        row.compensating_plan,
      ) as DualCustodyQuorumReceipt['compensatingPlan'],
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      finalizedAt: row.finalized_at?.toISOString(),
    };
  }
}
