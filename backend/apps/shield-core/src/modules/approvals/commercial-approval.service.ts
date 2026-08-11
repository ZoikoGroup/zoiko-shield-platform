import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IsIn, IsISO8601, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { assertTransition } from '../commerce/state-machine.util';

export const APPROVAL_CHANGE_TYPES = [
  'PRICE_CHANGE',
  'NON_STANDARD_DISCOUNT',
  'FREE_MONTHS',
  'SERVICE_CREDIT',
  'REFUND',
  'CONTRACT_OVERRIDE',
  'REGION_EXCEPTION',
  'ENTITLEMENT_ELEVATION',
  'EMERGENCY_ENTITLEMENT_EXTENSION',
  'PARTNER_MARGIN_OVERRIDE',
  'OVERAGE_OVERRIDE',
] as const;
export type ApprovalChangeType = (typeof APPROVAL_CHANGE_TYPES)[number];

/**
 * ZS-COM-BILL-001 Part 20 canonical approval state machine. Requests are
 * created directly in PENDING_APPROVAL (the REQUESTED instant is implicit
 * at creation time, there is no separate submit step).
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  APPROVED: ['APPLIED'],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
  APPLIED: [],
};

export class RequestApprovalDto {
  @IsIn(APPROVAL_CHANGE_TYPES)
  changeType!: ApprovalChangeType;

  @IsString()
  objectType!: string;

  @IsString()
  objectId!: string;

  @IsString()
  requestedBy!: string;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsObject()
  beforeSnapshot?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  proposedSnapshot?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  financialImpact?: number;

  @IsOptional()
  @IsNumber()
  marginImpact?: number;

  @IsOptional()
  @IsString()
  requiredApprovalRole?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: Date;
}

@Injectable()
export class CommercialApprovalService {
  private readonly logger = new Logger(CommercialApprovalService.name);

  constructor(private readonly prisma: PrismaService) {}

  async requestApproval(dto: RequestApprovalDto) {
    this.logger.log(
      `Requesting ${dto.changeType} approval for ${dto.objectType}/${dto.objectId} by ${dto.requestedBy}`,
    );

    return this.prisma.$transaction(async (tx) => {
      const approval = await tx.commercialApproval.create({
        data: {
          change_type: dto.changeType,
          object_type: dto.objectType,
          object_id: dto.objectId,
          requested_by: dto.requestedBy,
          reason: dto.reason,
          before_snapshot: JSON.stringify(dto.beforeSnapshot ?? {}),
          proposed_snapshot: JSON.stringify(dto.proposedSnapshot ?? {}),
          financial_impact: dto.financialImpact,
          margin_impact: dto.marginImpact,
          required_approval_role: dto.requiredApprovalRole || 'BILLING_ADMIN',
          status: 'PENDING_APPROVAL',
          expires_at: dto.expiresAt,
        },
      });

      await tx.commercialEvent.create({
        data: {
          event_type: 'commercial_approval.requested',
          tenant_id: dto.objectType,
          actor: dto.requestedBy,
          payload: JSON.stringify({ approvalId: approval.id, changeType: dto.changeType }),
          idempotency_key: `commercial-approval-requested-${approval.id}`,
        },
      });

      return approval;
    });
  }

  async getApprovalById(approvalId: string) {
    const approval = await this.prisma.commercialApproval.findUnique({ where: { id: approvalId } });
    if (!approval) {
      throw new NotFoundException(`Commercial approval '${approvalId}' not found`);
    }
    return approval;
  }

  /** Used by consuming domains (e.g. amendments) that link back to their approval by object identity. */
  async getApprovalByObject(objectType: string, objectId: string) {
    const approval = await this.prisma.commercialApproval.findFirst({
      where: { object_type: objectType, object_id: objectId },
      orderBy: { requested_at: 'desc' },
    });
    if (!approval) {
      throw new NotFoundException(`No commercial approval found for ${objectType}/${objectId}`);
    }
    return approval;
  }

  /**
   * Part 9: expiry is enforced dynamically on every mutation attempt, not
   * only by a background sweeper — a PENDING_APPROVAL past its expires_at
   * is flipped to EXPIRED in place before the caller's action is evaluated.
   */
  private async assertNotExpired(approval: { id: string; status: string; expires_at: Date | null }) {
    if (approval.status === 'PENDING_APPROVAL' && approval.expires_at && approval.expires_at < new Date()) {
      await this.prisma.commercialApproval.update({ where: { id: approval.id }, data: { status: 'EXPIRED' } });
      throw new ConflictException({
        statusCode: 409,
        error: 'COMMERCIAL_APPROVAL_EXPIRED',
        message: `Commercial approval '${approval.id}' expired at ${approval.expires_at.toISOString()}`,
      });
    }
  }

  /**
   * Part 3 critical rule: requester != approver for sensitive commercial
   * mutations. No emergency bypass is implemented yet (Remaining Gaps).
   */
  async decideApproval(
    approvalId: string,
    approverId: string,
    decision: 'APPROVED' | 'REJECTED',
    decisionReason: string,
  ) {
    const approval = await this.getApprovalById(approvalId);
    await this.assertNotExpired(approval);

    if (approval.requested_by === approverId) {
      throw new ForbiddenException(
        `Approver '${approverId}' cannot decide on a commercial approval they requested themselves (maker-checker violation)`,
      );
    }

    assertTransition(ALLOWED_TRANSITIONS, approval.status, decision, 'commercial approval');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.commercialApproval.update({
        where: { id: approvalId },
        data: {
          status: decision,
          approved_by: approverId,
          approved_at: new Date(),
          decision_reason: decisionReason,
        },
      });

      await tx.commercialEvent.create({
        data: {
          event_type: `commercial_approval.${decision.toLowerCase()}`,
          tenant_id: approval.object_type,
          actor: approverId,
          payload: JSON.stringify({ approvalId, decision, decisionReason }),
          idempotency_key: `commercial-approval-decided-${approvalId}`,
        },
      });

      return updated;
    });
  }

  /**
   * Marks an approved change as actually applied by the consuming domain
   * service (e.g. QuoteService.approveQuote calling this once it has
   * executed the underlying mutation).
   */
  async markApplied(approvalId: string) {
    const approval = await this.getApprovalById(approvalId);
    assertTransition(ALLOWED_TRANSITIONS, approval.status, 'APPLIED', 'commercial approval');

    return this.prisma.commercialApproval.update({
      where: { id: approvalId },
      data: { status: 'APPLIED', applied_at: new Date() },
    });
  }
}
