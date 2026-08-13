import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { ContentHashService } from '../../evidence/hashing/content-hash.service';
import { AuthorizationDecisionService } from '../../authorization-decision/authorization-decision.service';
import { CANONICAL_TOPICS } from '../../../kafka/kafka-producer.service';

const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000; // 24h to be acted on
const APPROVAL_TTL_MS = 60 * 60 * 1000; // 1h approval validity window

export interface CreateProposalInput {
  tenantId: string;
  environmentId: string;
  caseId?: string;
  alertId?: string;
  targetType: string;
  targetId: string;
  actionType: string;
  reason: string;
  requestedBy: string;
  recommendationSource: string;
  reversible?: boolean;
  rollbackActionType?: string;
  residualRisk?: string;
}

/**
 * ActionProposal/ActionApproval live in shield-core (spec §20/§22).
 * Authority is hard-pinned to R1 — this milestone builds no live-execution
 * path, so nothing here can ever request R2+.
 */
@Injectable()
export class ResponseProposalService {
  private readonly logger = new Logger(ResponseProposalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly hashService: ContentHashService,
    private readonly authorizationDecisionService: AuthorizationDecisionService,
  ) {}

  async createProposal(input: CreateProposalInput) {
    const { authorizationDecisionId, decision } = await this.authorizationDecisionService.evaluate({
      actorId: input.requestedBy,
      tenantId: input.tenantId,
      action: 'response_proposal:create',
      resourceType: input.targetType,
      resourceId: input.targetId,
    });
    if (decision === 'DENY') {
      throw new BadRequestException('Actor is not authorized to create response proposals');
    }

    const correlationId = randomUUID();
    const expiresAt = new Date(Date.now() + PROPOSAL_TTL_MS);

    const [proposal] = await this.prisma.$transaction([
      this.prisma.actionProposal.create({
        data: {
          tenant_id: input.tenantId,
          environment_id: input.environmentId,
          case_id: input.caseId,
          alert_id: input.alertId,
          target_type: input.targetType,
          target_id: input.targetId,
          action_type: input.actionType,
          reason: input.reason,
          authority_level: 'R1',
          requested_by: input.requestedBy,
          recommendation_source: input.recommendationSource,
          reversible: input.reversible ?? true,
          rollback_action_type: input.rollbackActionType,
          residual_risk: input.residualRisk,
          authorization_decision_id: authorizationDecisionId,
          correlation_id: correlationId,
          status: 'PROPOSED',
          expires_at: expiresAt,
        },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId: input.tenantId,
          topic: CANONICAL_TOPICS.ACTION_PROPOSED,
          eventType: 'action.proposed',
          correlationId,
          payload: { caseId: input.caseId, actionType: input.actionType, targetType: input.targetType, targetId: input.targetId },
        }),
      }),
    ]);

    return proposal;
  }

  async approve(params: { tenantId: string; proposalId: string; approverId: string; reason?: string }) {
    const proposal = await this.prisma.actionProposal.findFirst({ where: { id: params.proposalId, tenant_id: params.tenantId } });
    if (!proposal) {
      throw new NotFoundException(`ActionProposal '${params.proposalId}' not found`);
    }
    if (proposal.status !== 'PROPOSED') {
      throw new BadRequestException(`ActionProposal '${params.proposalId}' is not in a state that can be approved (${proposal.status})`);
    }

    const { authorizationDecisionId, decision } = await this.authorizationDecisionService.evaluate({
      actorId: params.approverId,
      tenantId: params.tenantId,
      action: 'response_proposal:approve',
      resourceType: proposal.target_type,
      resourceId: proposal.target_id,
    });
    if (decision === 'DENY') {
      throw new BadRequestException('Actor is not authorized to approve response proposals');
    }

    const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS);
    const { contentHash: approvedMaterialHash } = this.hashService.hashCanonicalJson({
      tenantId: params.tenantId,
      environmentId: proposal.environment_id,
      proposalId: proposal.id,
      proposalVersion: proposal.version,
      actionType: proposal.action_type,
      targetType: proposal.target_type,
      targetId: proposal.target_id,
      authorityLevel: proposal.authority_level,
      policyVersion: proposal.policy_version,
      approvalExpiresAt: expiresAt.toISOString(),
    });

    const correlationId = randomUUID();

    const [approval] = await this.prisma.$transaction([
      this.prisma.actionApproval.create({
        data: {
          tenant_id: params.tenantId,
          proposal_id: proposal.id,
          approver_id: params.approverId,
          decision: 'APPROVED',
          authority: proposal.authority_level,
          reason: params.reason,
          proposal_version: proposal.version,
          action_type: proposal.action_type,
          target_type: proposal.target_type,
          target_id: proposal.target_id,
          approved_material_hash: approvedMaterialHash,
          authorization_decision_id: authorizationDecisionId,
          expires_at: expiresAt,
        },
      }),
      this.prisma.actionProposal.update({ where: { id: proposal.id }, data: { status: 'APPROVED' } }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId: params.tenantId,
          topic: CANONICAL_TOPICS.ACTION_APPROVED,
          eventType: 'action.approved',
          correlationId,
          payload: { proposalId: proposal.id, caseId: proposal.case_id, alertId: proposal.alert_id },
        }),
      }),
    ]);

    return approval;
  }

  async reject(params: { tenantId: string; proposalId: string; actorId: string; reason: string }) {
    const proposal = await this.prisma.actionProposal.findFirst({ where: { id: params.proposalId, tenant_id: params.tenantId } });
    if (!proposal) {
      throw new NotFoundException(`ActionProposal '${params.proposalId}' not found`);
    }

    const correlationId = randomUUID();
    const [updated] = await this.prisma.$transaction([
      this.prisma.actionProposal.update({ where: { id: proposal.id }, data: { status: 'REJECTED' } }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId: params.tenantId,
          topic: CANONICAL_TOPICS.ACTION_REJECTED,
          eventType: 'action.rejected',
          correlationId,
          payload: { proposalId: proposal.id, actorId: params.actorId, reason: params.reason },
        }),
      }),
    ]);
    return updated;
  }

  async getById(tenantId: string, proposalId: string) {
    const proposal = await this.prisma.actionProposal.findFirst({ where: { id: proposalId, tenant_id: tenantId } });
    if (!proposal) {
      throw new NotFoundException(`ActionProposal '${proposalId}' not found`);
    }
    return proposal;
  }

  async listForCase(tenantId: string, caseId: string) {
    return this.prisma.actionProposal.findMany({
      where: { tenant_id: tenantId, case_id: caseId },
      orderBy: { created_at: 'desc' },
    });
  }

  async getSimulation(tenantId: string, proposalId: string) {
    await this.getById(tenantId, proposalId);
    const command = await this.prisma.actionCommand.findFirst({
      where: { tenant_id: tenantId, proposal_id: proposalId },
      orderBy: { created_at: 'desc' },
      include: { receipts: { orderBy: { created_at: 'desc' }, take: 1 } },
    });
    return command
      ? { state: command.receipts[0]?.status ?? 'PROCESSING', actionCommandId: command.id, receipt: command.receipts[0] ?? null }
      : { state: 'QUEUED', actionCommandId: null, receipt: null };
  }

  async freezeTenant(tenantId: string, createdBy: string, reason: string) {
    if (!reason?.trim()) throw new BadRequestException('A response freeze reason is required');
    const existing = await this.getActiveFreeze(tenantId);
    if (existing) return existing;
    return this.prisma.freeze.create({
      data: { tenant_id: tenantId, scope: 'TENANT', reason: reason.trim(), created_by: createdBy },
    });
  }

  async unfreezeTenant(tenantId: string) {
    const now = new Date();
    const result = await this.prisma.freeze.updateMany({
      where: {
        tenant_id: tenantId,
        scope: 'TENANT',
        active_from: { lte: now },
        OR: [{ active_until: null }, { active_until: { gt: now } }],
      },
      data: { active_until: now },
    });
    return { frozen: false, endedFreezes: result.count, activeUntil: now };
  }

  async getFreezeStatus(tenantId: string) {
    const freeze = await this.getActiveFreeze(tenantId);
    return { frozen: !!freeze, status: freeze ? 'FROZEN' : 'OPERATIONAL', freeze };
  }

  private getActiveFreeze(tenantId: string) {
    const now = new Date();
    return this.prisma.freeze.findFirst({
      where: {
        tenant_id: tenantId,
        scope: 'TENANT',
        active_from: { lte: now },
        OR: [{ active_until: null }, { active_until: { gt: now } }],
      },
      orderBy: { active_from: 'desc' },
    });
  }
}
