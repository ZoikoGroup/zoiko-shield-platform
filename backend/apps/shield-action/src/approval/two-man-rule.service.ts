import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';

export type TwoManRuleStatus =
  | 'PENDING_SECOND_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED';

export interface TwoManRuleTicketInput {
  tenantId: string;
  initiatorId: string;
  proposalId: string;
  actionType: string;
  targetResource: string;
  authorityLevel: 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
  rationale: string;
  ttlMinutes?: number;
  environmentId?: string;
}

export interface TwoManApprovalInput {
  tenantId: string;
  ticketId: string;
  approverId: string;
  approvalNotes?: string;
  fido2MfaToken?: string;
}

export interface TwoManRuleTicket {
  ticketId: string;
  tenantId: string;
  initiatorId: string;
  proposalId: string;
  actionType: string;
  targetResource: string;
  authorityLevel: 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
  rationale: string;
  environmentId: string;
  status: TwoManRuleStatus;
  createdAt: string;
  expiresAt: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalNotes?: string;
  approvalSignature?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

/**
 * Two-Man Rule Dual-Authorization Service for High-Impact (R3) & Critical (R4) Remediation Actions.
 * Governed by ZS-ENG-INT-001, ZS-T0-TECH-001 §6, and ZS-ENG-REQ-001 §9.
 */
@Injectable()
export class TwoManRuleService {
  private readonly logger = new Logger(TwoManRuleService.name);
  private readonly secretSigningKey =
    process.env.TWO_MAN_SIGNING_KEY || 'zoiko-two-man-rule-ephemeral-secret-key-2026';

  // In-memory registry of two-man authorization tickets
  private readonly tickets = new Map<string, TwoManRuleTicket>();

  /**
   * Submits a new Two-Man Rule dual-authorization ticket.
   */
  submitTicket(input: TwoManRuleTicketInput): TwoManRuleTicket {
    if (!input.tenantId || !input.initiatorId || !input.proposalId) {
      throw new BadRequestException(
        'Missing required parameters: tenantId, initiatorId, and proposalId are mandatory.',
      );
    }

    const ttlMinutes = input.ttlMinutes ?? 15;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString();
    const createdAt = now.toISOString();
    const ticketId = `ticket-2man-${crypto.randomUUID()}`;

    const ticket: TwoManRuleTicket = {
      ticketId,
      tenantId: input.tenantId,
      initiatorId: input.initiatorId,
      proposalId: input.proposalId,
      actionType: input.actionType,
      targetResource: input.targetResource,
      authorityLevel: input.authorityLevel,
      rationale: input.rationale,
      environmentId: input.environmentId || 'production',
      status: 'PENDING_SECOND_APPROVAL',
      createdAt,
      expiresAt,
    };

    this.tickets.set(`${input.tenantId}:${ticketId}`, ticket);

    this.logger.log(
      `✔ [TWO-MAN RULE TICKET CREATED] Ticket '${ticketId}' submitted by '${input.initiatorId}' for proposal '${input.proposalId}' [Action: ${input.actionType}, Level: ${input.authorityLevel}]`,
    );

    return ticket;
  }

  /**
   * Approves a pending Two-Man Rule ticket by a distinct secondary authorized operator.
   */
  approveTicket(input: TwoManApprovalInput): TwoManRuleTicket {
    const key = `${input.tenantId}:${input.ticketId}`;
    const ticket = this.tickets.get(key);

    if (!ticket) {
      throw new NotFoundException(
        `Two-man rule ticket '${input.ticketId}' not found for tenant '${input.tenantId}'.`,
      );
    }

    const nowTime = Date.now();
    const expiryTime = new Date(ticket.expiresAt).getTime();

    if (nowTime > expiryTime) {
      ticket.status = 'EXPIRED';
      this.logger.warn(`🛑 [TWO-MAN RULE TICKET EXPIRED] Ticket '${input.ticketId}' has expired.`);
      throw new BadRequestException(
        `Two-man rule ticket '${input.ticketId}' has expired at ${ticket.expiresAt}.`,
      );
    }

    if (ticket.status !== 'PENDING_SECOND_APPROVAL') {
      throw new BadRequestException(
        `Cannot approve ticket '${input.ticketId}' with status '${ticket.status}'.`,
      );
    }

    // Strict non-negotiable check: Approver MUST be distinct from the Initiator
    if (input.approverId === ticket.initiatorId) {
      this.logger.error(
        `🚨 [TWO-MAN RULE VIOLATION] Operator '${input.approverId}' attempted to self-approve ticket '${input.ticketId}'!`,
      );
      throw new ForbiddenException(
        `Two-Man Rule Dual-Authorization Violation: Initiator '${ticket.initiatorId}' cannot approve their own high-impact action ticket.`,
      );
    }

    const approvedAt = new Date().toISOString();

    // Compute cryptographic dual-authorization signature
    const signaturePayload = {
      ticketId: ticket.ticketId,
      tenantId: ticket.tenantId,
      initiatorId: ticket.initiatorId,
      approverId: input.approverId,
      proposalId: ticket.proposalId,
      actionType: ticket.actionType,
      targetResource: ticket.targetResource,
      authorityLevel: ticket.authorityLevel,
      approvedAt,
    };

    const approvalSignature = crypto
      .createHmac('sha256', this.secretSigningKey)
      .update(JSON.stringify(signaturePayload))
      .digest('hex');

    ticket.status = 'APPROVED';
    ticket.approvedBy = input.approverId;
    ticket.approvedAt = approvedAt;
    ticket.approvalNotes = input.approvalNotes;
    ticket.approvalSignature = approvalSignature;

    this.logger.log(
      `✔ [TWO-MAN RULE APPROVED] Ticket '${input.ticketId}' approved by '${input.approverId}' (Signature: ${approvalSignature.substring(0, 16)}...)`,
    );

    return ticket;
  }

  /**
   * Rejects a pending Two-Man Rule ticket.
   */
  rejectTicket(
    tenantId: string,
    ticketId: string,
    rejectorId: string,
    rejectionReason: string,
  ): TwoManRuleTicket {
    const key = `${tenantId}:${ticketId}`;
    const ticket = this.tickets.get(key);

    if (!ticket) {
      throw new NotFoundException(
        `Two-man rule ticket '${ticketId}' not found for tenant '${tenantId}'.`,
      );
    }

    if (ticket.status !== 'PENDING_SECOND_APPROVAL') {
      throw new BadRequestException(
        `Cannot reject ticket '${ticketId}' with status '${ticket.status}'.`,
      );
    }

    ticket.status = 'REJECTED';
    ticket.rejectedBy = rejectorId;
    ticket.rejectedAt = new Date().toISOString();
    ticket.rejectionReason = rejectionReason;

    this.logger.warn(
      `🛑 [TWO-MAN RULE REJECTED] Ticket '${ticketId}' rejected by '${rejectorId}': ${rejectionReason}`,
    );

    return ticket;
  }

  /**
   * Fetches an existing Two-Man Rule ticket.
   */
  getTicket(tenantId: string, ticketId: string): TwoManRuleTicket {
    const key = `${tenantId}:${ticketId}`;
    const ticket = this.tickets.get(key);

    if (!ticket) {
      throw new NotFoundException(
        `Two-man rule ticket '${ticketId}' not found for tenant '${tenantId}'.`,
      );
    }

    // Update status to EXPIRED if past expiry
    if (
      ticket.status === 'PENDING_SECOND_APPROVAL' &&
      Date.now() > new Date(ticket.expiresAt).getTime()
    ) {
      ticket.status = 'EXPIRED';
    }

    return ticket;
  }

  /**
   * Validates whether a proposal has a valid, unexpired, dual-authorized Two-Man Rule approval.
   */
  validateDualAuthorization(
    tenantId: string,
    ticketId: string,
    proposalId: string,
  ): { valid: boolean; reason?: string; ticket?: TwoManRuleTicket } {
    const key = `${tenantId}:${ticketId}`;
    const ticket = this.tickets.get(key);

    if (!ticket) {
      return { valid: false, reason: `Ticket '${ticketId}' not found.` };
    }

    if (ticket.proposalId !== proposalId) {
      return {
        valid: false,
        reason: `Ticket proposalId '${ticket.proposalId}' does not match requested proposalId '${proposalId}'.`,
      };
    }

    if (ticket.status !== 'APPROVED') {
      return {
        valid: false,
        reason: `Ticket status is '${ticket.status}', expected 'APPROVED'.`,
      };
    }

    if (Date.now() > new Date(ticket.expiresAt).getTime()) {
      ticket.status = 'EXPIRED';
      return {
        valid: false,
        reason: `Ticket '${ticketId}' has expired.`,
      };
    }

    if (!ticket.approvalSignature || !ticket.approvedBy) {
      return {
        valid: false,
        reason: 'Ticket is missing cryptographic approval signature or approver identity.',
      };
    }

    return { valid: true, ticket };
  }
}
