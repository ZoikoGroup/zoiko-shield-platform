import {
  Controller,
  Get,
  Headers,
  Param,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { InternalAuthGuard } from '../../../internal-client/internal-auth.guard';
import { AuthorizationDecisionService } from '../../authorization-decision/authorization-decision.service';
import { ActionAuthorizationContext } from '../action-authorization-context.types';
import { requireTenantId } from '../../../tenant-context';

/**
 * shield-action's ONLY window into shield-core-owned data (correction #3)
 * — it never queries ActionProposal/ActionApproval/Case/Alert/authorization
 * tables directly, even though the schema is physically shared. Every
 * field needed to independently reauthorize a response action is
 * re-resolved fresh here, not read from the triggering Kafka payload.
 */
@Controller('internal/v1/action-proposals')
@UseGuards(InternalAuthGuard)
export class ActionAuthorizationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationDecisionService: AuthorizationDecisionService,
  ) {}

  @Get(':proposalId/authorization-context')
  async getAuthorizationContext(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('proposalId') proposalId: string,
  ): Promise<{ data: ActionAuthorizationContext }> {
    const tenantId = requireTenantId(headerTenantId);
    const proposal = await this.prisma.actionProposal.findFirst({
      where: { id: proposalId, tenant_id: tenantId },
    });
    if (!proposal) {
      throw new NotFoundException(`ActionProposal '${proposalId}' not found`);
    }

    const latestApproval = await this.prisma.actionApproval.findFirst({
      where: { proposal_id: proposalId, tenant_id: tenantId },
      orderBy: { approved_at: 'desc' },
    });

    // Re-evaluate authorization fresh — never trust a decision resolved at
    // proposal/approval time as still valid now (roles/entitlements may
    // have changed since).
    const evaluationActorId =
      latestApproval?.approver_id ?? proposal.requested_by;
    const { authorizationDecisionId, decision } =
      await this.authorizationDecisionService.evaluate({
        actorId: evaluationActorId,
        tenantId: proposal.tenant_id,
        action: 'response_action:execute',
        resourceType: proposal.target_type,
        resourceId: proposal.target_id,
        correlationId: randomUUID(),
      });

    const context: ActionAuthorizationContext = {
      tenantId: proposal.tenant_id,
      environmentId: proposal.environment_id,
      proposalId: proposal.id,
      caseId: proposal.case_id ?? undefined,
      alertId: proposal.alert_id ?? undefined,
      actionType: proposal.action_type,
      targetType: proposal.target_type,
      targetId: proposal.target_id,
      authorityLevel: proposal.authority_level,
      proposalStatus: proposal.status,
      approval: latestApproval
        ? {
            approvalId: latestApproval.id,
            decision: latestApproval.decision,
            approverId: latestApproval.approver_id,
            expiresAt: latestApproval.expires_at.toISOString(),
          }
        : null,
      policyVersion: proposal.policy_version,
      authorizationDecisionId,
      entitlementAllowed: decision === 'PERMIT',
      // Simulation never claims a live target state. A live-execution path
      // must supply a connector-specific verified state before authorization.
      targetState: {
        verified: false,
        note: 'UNVERIFIED: simulation does not assert live connector target state',
      },
      proposalVersion: proposal.version,
      approvedMaterialHash: latestApproval?.approved_material_hash ?? null,
      correlationId: randomUUID(),
    };

    return { data: context };
  }
}
