import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthorizationService } from '../authorization/authorization.service';

export interface EvaluateInput {
  actorId: string;
  tenantId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  correlationId?: string;
}

export interface AuthorizationDecisionResult {
  authorizationDecisionId: string;
  decision: 'ALLOW' | 'DENY';
}

/**
 * Real authorization decisions, not generated UUIDs (spec correction #2).
 * Wraps the existing RBAC permission-check (AuthorizationService, TypeORM
 * side, already built for the platform's own auth) with a Prisma-side
 * persisted AuthorizationDecision row — every AI request, AI tool call,
 * human review, ActionProposal creation, ActionApproval, and
 * shield-action's re-evaluation uses the id this returns, win or lose.
 */
@Injectable()
export class AuthorizationDecisionService {
  private readonly logger = new Logger(AuthorizationDecisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async evaluate(input: EvaluateInput): Promise<AuthorizationDecisionResult> {
    const grantedPermissions =
      await this.authorizationService.getPermissionCodesForPrincipal(
        input.tenantId,
        input.actorId,
      );
    const allowed = grantedPermissions.includes(input.action);

    const decision = await this.prisma.authorizationDecision.create({
      data: {
        tenant_id: input.tenantId,
        actor_id: input.actorId,
        action: input.action,
        resource_type: input.resourceType,
        resource_id: input.resourceId,
        decision: allowed ? 'ALLOW' : 'DENY',
        reason: allowed
          ? `Actor holds permission '${input.action}'`
          : `Actor lacks required permission '${input.action}'`,
        correlation_id: input.correlationId,
      },
    });

    if (!allowed) {
      this.logger.warn(
        `AuthorizationDecision DENY: actor=${input.actorId} tenant=${input.tenantId} action=${input.action}`,
      );
    }

    return {
      authorizationDecisionId: decision.id,
      decision: allowed ? 'ALLOW' : 'DENY',
    };
  }
}
