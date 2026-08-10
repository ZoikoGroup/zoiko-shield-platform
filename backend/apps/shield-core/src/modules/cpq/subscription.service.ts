import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IsISO8601, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { assertTransition } from '../commerce/state-machine.util';

const SUBSCRIPTION_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['CANCELLED', 'EXPIRED'],
  CANCELLED: [],
  EXPIRED: [],
};

/**
 * The amendment row's own status is a mirror of its linked CommercialApproval
 * (source of truth for the maker-checker decision) plus a local REQUESTED->
 * APPLIED terminal step. This map only guards against re-deciding/re-applying
 * an amendment already settled — it is not a second maker-checker engine.
 */
const AMENDMENT_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['APPLIED'],
  REJECTED: [],
  APPLIED: [],
  CANCELLED: [],
};

export class CreateSubscriptionDto {
  orderId!: string;
  commercialAccountId!: string;
  contractId!: string;
  effectiveFrom?: Date;
  effectiveTo?: Date;
}

export class RequestAmendmentDto {
  @IsString()
  amendmentType!: string;

  @IsString()
  requestedBy!: string;

  @IsOptional()
  @IsISO8601()
  effectiveAt?: Date;

  @IsOptional()
  @IsObject()
  beforeSnapshot?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  proposedSnapshot?: Record<string, unknown>;
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalService: CommercialApprovalService,
  ) {}

  /** Accepts an optional transaction client so OrderService.provisionOrder can create it atomically alongside the Contract. */
  async createSubscription(dto: CreateSubscriptionDto, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.commercialSubscription.create({
      data: {
        order_id: dto.orderId,
        commercial_account_id: dto.commercialAccountId,
        contract_id: dto.contractId,
        status: 'PENDING',
        effective_from: dto.effectiveFrom,
        effective_to: dto.effectiveTo,
      },
    });
  }

  async getSubscriptionById(subscriptionId: string) {
    const subscription = await this.prisma.commercialSubscription.findUnique({
      where: { id: subscriptionId },
      include: { amendments: true },
    });
    if (!subscription) {
      throw new NotFoundException(`Subscription '${subscriptionId}' not found`);
    }
    return subscription;
  }

  async activateSubscription(subscriptionId: string) {
    const subscription = await this.getSubscriptionById(subscriptionId);
    assertTransition(SUBSCRIPTION_TRANSITIONS, subscription.status, 'ACTIVE', 'subscription');
    return this.prisma.commercialSubscription.update({
      where: { id: subscriptionId },
      data: { status: 'ACTIVE' },
    });
  }

  async cancelSubscription(subscriptionId: string) {
    const subscription = await this.getSubscriptionById(subscriptionId);
    assertTransition(SUBSCRIPTION_TRANSITIONS, subscription.status, 'CANCELLED', 'subscription');
    return this.prisma.commercialSubscription.update({
      where: { id: subscriptionId },
      data: { status: 'CANCELLED' },
    });
  }

  /**
   * Creates the amendment record and immediately opens a linked
   * CommercialApproval — the generic maker-checker engine (Part 20), not a
   * second bespoke implementation.
   */
  async requestAmendment(subscriptionId: string, dto: RequestAmendmentDto) {
    await this.getSubscriptionById(subscriptionId);

    const amendment = await this.prisma.commercialAmendment.create({
      data: {
        subscription_id: subscriptionId,
        amendment_type: dto.amendmentType,
        status: 'REQUESTED',
        effective_at: dto.effectiveAt,
        before_snapshot: JSON.stringify(dto.beforeSnapshot ?? {}),
        proposed_snapshot: JSON.stringify(dto.proposedSnapshot ?? {}),
        requested_by: dto.requestedBy,
      },
    });

    await this.approvalService.requestApproval({
      changeType: 'CONTRACT_OVERRIDE',
      objectType: 'CommercialAmendment',
      objectId: amendment.id,
      requestedBy: dto.requestedBy,
      reason: `${dto.amendmentType} amendment for subscription ${subscriptionId}`,
      beforeSnapshot: dto.beforeSnapshot,
      proposedSnapshot: dto.proposedSnapshot,
    });

    return this.prisma.commercialAmendment.update({
      where: { id: amendment.id },
      data: { status: 'REQUESTED' }, // no-op write keeping the row's updated_at in sync with its approval
    });
  }

  /**
   * Decides the linked CommercialApproval — requester != approver and the
   * expiry check are both enforced there, once, for every commercial
   * object type. This method only mirrors the outcome onto the amendment
   * row and guards against re-deciding an already-settled amendment.
   */
  async decideAmendment(amendmentId: string, approverId: string, decision: 'APPROVED' | 'REJECTED', reason: string) {
    const amendment = await this.prisma.commercialAmendment.findUnique({ where: { id: amendmentId } });
    if (!amendment) {
      throw new NotFoundException(`Amendment '${amendmentId}' not found`);
    }
    assertTransition(AMENDMENT_TRANSITIONS, amendment.status, decision, 'subscription amendment');

    const approval = await this.approvalService.getApprovalByObject('CommercialAmendment', amendmentId);
    await this.approvalService.decideApproval(approval.id, approverId, decision, reason);

    return this.prisma.commercialAmendment.update({
      where: { id: amendmentId },
      data: { status: decision, approved_by: approverId },
    });
  }
}
