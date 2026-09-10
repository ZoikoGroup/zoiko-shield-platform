import { Injectable, Logger, ForbiddenException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

export interface ApprovalRequest {
  approvalId: string;
  tenantId: string;
  commandId: string;
  actionType: string;
  targetRef: string;
  authorityLevel: 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
  initiator: {
    userId: string;
    role: string;
    signedAt: string;
  };
  approver?: {
    userId: string;
    role: string;
    signedAt: string;
  };
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  expiresAt: string;
}

/**
 * Dual-Custody Approval Quorum Service (Spec §15 & LAB 15)
 * 
 * Enforces:
 * 1. Single approval sufficient for R0/R1 actions.
 * 2. Mandatory dual-custody (Two-Man Rule) for R2+ actions.
 * 3. Segregation of duties: Initiator and Approver must be distinct principals.
 * 4. Time-bounded approval expiration (default: 15 minutes).
 */
@Injectable()
export class DualCustodyApprovalsService {
  private readonly logger = new Logger(DualCustodyApprovalsService.name);
  private readonly approvalStore = new Map<string, ApprovalRequest>();

  /**
   * Initiates an approval request for a proposed response action.
   */
  initiateApproval(
    tenantId: string,
    commandId: string,
    actionType: string,
    targetRef: string,
    authorityLevel: 'R0' | 'R1' | 'R2' | 'R3' | 'R4',
    initiatorUserId: string,
    initiatorRole: string,
    ttlSeconds = 900,
  ): ApprovalRequest {
    const approvalId = `appr-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

    const request: ApprovalRequest = {
      approvalId,
      tenantId,
      commandId,
      actionType,
      targetRef,
      authorityLevel,
      initiator: {
        userId: initiatorUserId,
        role: initiatorRole,
        signedAt: now.toISOString(),
      },
      status: authorityLevel === 'R0' || authorityLevel === 'R1' ? 'APPROVED' : 'PENDING_APPROVAL',
      expiresAt,
    };

    this.approvalStore.set(approvalId, request);
    return request;
  }

  /**
   * Approves a pending dual-custody approval request by a secondary security officer.
   */
  approveRequest(
    approvalId: string,
    approverUserId: string,
    approverRole: string,
  ): ApprovalRequest {
    const request = this.approvalStore.get(approvalId);
    if (!request) {
      throw new BadRequestException(`Approval request ${approvalId} not found`);
    }

    if (new Date() > new Date(request.expiresAt)) {
      request.status = 'EXPIRED';
      throw new ForbiddenException(`Approval request ${approvalId} has expired`);
    }

    // Invariant: Segregation of duties - Approver cannot be the Initiator
    if (request.initiator.userId === approverUserId) {
      throw new ForbiddenException(
        'Dual-custody segregation violation: Approver cannot be the initiating analyst.',
      );
    }

    request.approver = {
      userId: approverUserId,
      role: approverRole,
      signedAt: new Date().toISOString(),
    };
    request.status = 'APPROVED';

    return request;
  }

  /**
   * Validates whether a command has valid approval authority before live execution.
   */
  validateExecutionAuthority(approvalId: string): boolean {
    const request = this.approvalStore.get(approvalId);
    if (!request) return false;
    if (request.status !== 'APPROVED') return false;
    if (new Date() > new Date(request.expiresAt)) return false;

    // R2+ requires secondary approver
    if (request.authorityLevel !== 'R0' && request.authorityLevel !== 'R1') {
      if (!request.approver || !request.approver.userId) {
        return false;
      }
    }

    return true;
  }
}
