import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';

export interface ApproverIdentity {
  userId: string;
  fullName: string;
  role: 'SECURITY_OPERATIONS_LEAD' | 'TENANT_OWNER' | 'INCIDENT_COMMANDER';
  fido2WebAuthnSignature: string;
  signedAt: string;
}

export interface DualCustodyQuorumRequest {
  quorumId?: string;
  tenantId: string;
  environmentId: string;
  caseId: string;
  proposalId: string;
  actionType:
    | 'REVOKE_IAM_SESSION'
    | 'ISOLATE_ENDPOINT'
    | 'DISABLE_USER_ACCOUNT'
    | 'QUARANTINE_FILE'
    | 'APPLY_WAF_BLOCK';
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
  status: 'PENDING_SECOND_SIGNATURE' | 'QUORUM_REACHED' | 'REJECTED' | 'EXPIRED';
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
 * Specification: ZS-ENG-ACT-001 §8 (Dual-Custody Approvals) & ZS-T0-TECH-001 §6
 */
@Injectable()
export class DualCustodyQuorumService {
  private readonly logger = new Logger(DualCustodyQuorumService.name);
  private readonly secretKey =
    process.env.DUAL_CUSTODY_SECRET_KEY || 'zs-dual-custody-quantum-secret-2026';

  private readonly quorums = new Map<string, DualCustodyQuorumReceipt>();

  /**
   * Initiates a new Dual-Custody Approval Quorum for live R2/R3/R4 containment actions.
   */
  initiateQuorum(request: DualCustodyQuorumRequest): DualCustodyQuorumReceipt {
    if (!request.tenantId || !request.initiator?.userId || !request.proposalId) {
      throw new BadRequestException(
        'Missing required parameters: tenantId, proposalId, and initiator are mandatory.',
      );
    }

    if (!request.initiator.fido2WebAuthnSignature) {
      throw new ForbiddenException(
        'Initiator must provide valid FIDO2 / WebAuthn hardware attestation token.',
      );
    }

    const ttlMinutes = request.ttlMinutes ?? 15;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString();
    const createdAt = now.toISOString();
    const quorumId = request.quorumId || `quorum-${crypto.randomUUID()}`;
    const singleUseRollbackToken = `ZS-ROLLBACK-TOKEN-${crypto.randomUUID()}`;

    const receipt: DualCustodyQuorumReceipt = {
      quorumId,
      tenantId: request.tenantId,
      environmentId: request.environmentId || 'production',
      caseId: request.caseId,
      proposalId: request.proposalId,
      actionType: request.actionType,
      targetResource: request.targetResource,
      authorityLevel: request.authorityLevel,
      status: 'PENDING_SECOND_SIGNATURE',
      initiator: request.initiator,
      singleUseRollbackToken,
      compensatingPlan: {
        rollbackCommand: request.compensatingCommand,
        targetResource: request.targetResource,
        reversibilityTier: request.reversibilityTier,
      },
      createdAt,
      expiresAt,
    };

    this.quorums.set(`${request.tenantId}:${quorumId}`, receipt);
    this.logger.log(
      `✔ [DUAL-CUSTODY QUORUM INITIATED] Quorum '${quorumId}' for proposal '${request.proposalId}' by '${request.initiator.fullName}' [Rollback Token: ${singleUseRollbackToken}]`,
    );

    return receipt;
  }

  /**
   * Attests secondary signature to finalize dual-custody approval quorum.
   */
  signSecondApproval(
    tenantId: string,
    quorumId: string,
    approver: ApproverIdentity,
  ): DualCustodyQuorumReceipt {
    const key = `${tenantId}:${quorumId}`;
    const quorum = this.quorums.get(key);

    if (!quorum) {
      throw new NotFoundException(
        `Dual-custody quorum '${quorumId}' not found for tenant '${tenantId}'.`,
      );
    }

    if (Date.now() > new Date(quorum.expiresAt).getTime()) {
      quorum.status = 'EXPIRED';
      this.logger.warn(`🛑 [DUAL-CUSTODY EXPIRED] Quorum '${quorumId}' expired.`);
      throw new BadRequestException(`Dual-custody quorum '${quorumId}' has expired.`);
    }

    if (quorum.status !== 'PENDING_SECOND_SIGNATURE') {
      throw new BadRequestException(
        `Cannot sign quorum '${quorumId}' with status '${quorum.status}'.`,
      );
    }

    // NON-NEGOTIABLE RULE: Secondary approver MUST be distinct from initiator
    if (approver.userId === quorum.initiator.userId) {
      this.logger.error(
        `🚨 [DUAL-CUSTODY VIOLATION] Operator '${approver.userId}' attempted self-approval!`,
      );
      throw new ForbiddenException(
        `Dual-Custody Violation: Initiator '${quorum.initiator.fullName}' cannot self-approve their own containment action.`,
      );
    }

    if (!approver.fido2WebAuthnSignature) {
      throw new ForbiddenException(
        'Secondary approver must provide valid FIDO2 / WebAuthn hardware attestation token.',
      );
    }

    const finalizedAt = new Date().toISOString();

    // Compute cryptographic dual-custody quorum signature (ZS-QUORUM-RECEIPT-V1)
    const signaturePayload = {
      version: 'ZS-QUORUM-RECEIPT-V1',
      quorumId: quorum.quorumId,
      tenantId: quorum.tenantId,
      proposalId: quorum.proposalId,
      actionType: quorum.actionType,
      targetResource: quorum.targetResource,
      initiatorId: quorum.initiator.userId,
      approverId: approver.userId,
      singleUseRollbackToken: quorum.singleUseRollbackToken,
      finalizedAt,
    };

    const quorumSignature = crypto
      .createHmac('sha256', this.secretKey)
      .update(JSON.stringify(signaturePayload))
      .digest('hex');

    quorum.status = 'QUORUM_REACHED';
    quorum.secondaryApprover = approver;
    quorum.quorumSignature = quorumSignature;
    quorum.finalizedAt = finalizedAt;

    this.logger.log(
      `✔ [DUAL-CUSTODY QUORUM REACHED] Action '${quorum.actionType}' approved by '${quorum.initiator.fullName}' & '${approver.fullName}' (Signature: ${quorumSignature.slice(0, 16)}...)`,
    );

    return quorum;
  }

  /**
   * Validates whether an action proposal has a finalized, unexpired dual-custody signature.
   */
  validateQuorumForExecution(
    tenantId: string,
    quorumId: string,
    proposalId: string,
  ): { valid: boolean; reason?: string; receipt?: DualCustodyQuorumReceipt } {
    const key = `${tenantId}:${quorumId}`;
    const quorum = this.quorums.get(key);

    if (!quorum) {
      return { valid: false, reason: `Quorum '${quorumId}' not found.` };
    }

    if (quorum.proposalId !== proposalId) {
      return {
        valid: false,
        reason: `Quorum proposal '${quorum.proposalId}' does not match requested proposal '${proposalId}'.`,
      };
    }

    if (quorum.status !== 'QUORUM_REACHED') {
      return {
        valid: false,
        reason: `Quorum status is '${quorum.status}', expected 'QUORUM_REACHED'.`,
      };
    }

    if (Date.now() > new Date(quorum.expiresAt).getTime()) {
      quorum.status = 'EXPIRED';
      return { valid: false, reason: `Quorum '${quorumId}' has expired.` };
    }

    if (!quorum.quorumSignature || !quorum.secondaryApprover) {
      return {
        valid: false,
        reason: 'Quorum is missing cryptographic quorum signature or secondary approver.',
      };
    }

    return { valid: true, receipt: quorum };
  }

  getQuorum(tenantId: string, quorumId: string): DualCustodyQuorumReceipt {
    const key = `${tenantId}:${quorumId}`;
    const quorum = this.quorums.get(key);
    if (!quorum) {
      throw new NotFoundException(`Quorum '${quorumId}' not found for tenant '${tenantId}'.`);
    }
    return quorum;
  }
}
