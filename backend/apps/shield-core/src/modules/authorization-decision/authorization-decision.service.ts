import { createHash } from 'crypto';
import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthorizationService } from '../authorization/authorization.service';
import type { Assurance } from '../identity-adapter/session.entity';

export type AuthorizationDecisionEffect =
  'PERMIT' | 'DENY' | 'INDETERMINATE' | 'NOT_APPLICABLE';

export type AuthorizationEffectClass =
  | 'READ'
  | 'WRITE'
  | 'CONFIGURATION'
  | 'EXPORT'
  | 'PRIVILEGED'
  | 'RESPONSE'
  | 'DESTRUCTIVE';

export interface RequiredRelationship {
  relation: string;
  objectType?: string;
}

export interface EvaluateInput {
  actorId: string;
  tenantId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  resourceTenantId?: string;
  environmentId?: string | null;
  purpose?: string;
  effectClass?: AuthorizationEffectClass;
  requiredPermissions?: string[];
  requiredEntitlement?: string;
  requiredRelationship?: RequiredRelationship;
  assurance?: Assurance;
  requiredAssurance?: Assurance[];
  riskState?: string;
  policyVersion?: string;
  correlationId?: string;
  applicable?: boolean;
}

export interface AuthorizationDecisionResult {
  authorizationDecisionId: string;
  decision: AuthorizationDecisionEffect;
  reasonCode: string;
  obligations: string[];
}

/**
 * One enforcement contract for guards and domain services. Policy/dependency
 * uncertainty must remain distinguishable from a definitive policy denial,
 * while every non-PERMIT result still blocks the requested effect.
 */
export function assertPermittedAuthorization(
  result: AuthorizationDecisionResult,
  message = 'The requested operation is not authorized',
): void {
  if (result.decision === 'INDETERMINATE') {
    throw new ServiceUnavailableException({
      statusCode: 503,
      error: 'AUTHORIZATION_INDETERMINATE',
      message: 'A safe authorization decision could not be established',
      reasonCode: result.reasonCode,
      authorizationDecisionId: result.authorizationDecisionId,
    });
  }
  if (result.decision !== 'PERMIT') {
    throw new ForbiddenException({
      statusCode: 403,
      error: 'AUTHORIZATION_DENIED',
      message,
      reasonCode: result.reasonCode,
      authorizationDecisionId: result.authorizationDecisionId,
    });
  }
}

interface ResolvedDecision {
  decision: AuthorizationDecisionEffect;
  reasonCode: string;
  reason: string;
  obligations: string[];
}

const BLOCKED_RISK_STATES = new Set(['BLOCKED', 'COMPROMISED']);

/**
 * Fail-closed policy-decision baseline. It evaluates platform safety,
 * authoritative membership, current role permissions, optional entitlement,
 * optional relationship, assurance and risk before recording evidence for the
 * result. Domain PEPs remain responsible for querying resources by tenant.
 */
@Injectable()
export class AuthorizationDecisionService {
  private readonly logger = new Logger(AuthorizationDecisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async evaluate(input: EvaluateInput): Promise<AuthorizationDecisionResult> {
    const normalized = this.normalize(input);
    let resolved: ResolvedDecision;

    try {
      resolved = await this.resolve(normalized);
    } catch (error) {
      this.logger.error(
        `Authorization policy evaluation failed for action=${normalized.action}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      resolved = {
        decision: 'INDETERMINATE',
        reasonCode: 'POLICY_DEPENDENCY_UNAVAILABLE',
        reason: 'A required authorization authority was unavailable',
        obligations: ['DENY_EXECUTION', 'RETRY_WITH_FRESH_CONTEXT'],
      };
    }

    const contextHash = this.contextHash(normalized);
    const evidence = await this.prisma.authorizationDecision.create({
      data: {
        tenant_id: normalized.tenantId,
        environment_id: normalized.environmentId,
        actor_id: normalized.actorId,
        action: normalized.action,
        effect_class: normalized.effectClass,
        resource_type: normalized.resourceType,
        resource_id: normalized.resourceId,
        resource_tenant_id: normalized.resourceTenantId,
        purpose: normalized.purpose,
        required_permissions: JSON.stringify(normalized.requiredPermissions),
        required_entitlement: normalized.requiredEntitlement,
        decision: resolved.decision,
        policy_version: normalized.policyVersion,
        reason_code: resolved.reasonCode,
        reason: resolved.reason,
        obligations: JSON.stringify(resolved.obligations),
        context_hash: contextHash,
        correlation_id: normalized.correlationId,
      },
    });

    if (resolved.decision !== 'PERMIT') {
      this.logger.warn(
        `AuthorizationDecision ${resolved.decision}: actor=${normalized.actorId} tenant=${normalized.tenantId} action=${normalized.action} reason=${resolved.reasonCode}`,
      );
    }

    return {
      authorizationDecisionId: evidence.id,
      decision: resolved.decision,
      reasonCode: resolved.reasonCode,
      obligations: resolved.obligations,
    };
  }

  private normalize(input: EvaluateInput) {
    const permissions = [
      ...new Set(
        (input.requiredPermissions?.length
          ? input.requiredPermissions
          : [input.action]
        ).filter(Boolean),
      ),
    ].sort();
    return {
      ...input,
      action: input.action?.trim(),
      resourceType: input.resourceType?.trim(),
      resourceTenantId: input.resourceTenantId ?? input.tenantId,
      environmentId: input.environmentId ?? null,
      purpose: input.purpose?.trim() || 'interactive-api',
      effectClass: input.effectClass ?? ('READ' as AuthorizationEffectClass),
      requiredPermissions: permissions,
      policyVersion: input.policyVersion?.trim() || '1.0',
      applicable: input.applicable ?? true,
    };
  }

  private async resolve(
    input: ReturnType<AuthorizationDecisionService['normalize']>,
  ): Promise<ResolvedDecision> {
    if (
      !input.actorId ||
      !input.tenantId ||
      !input.action ||
      !input.resourceType ||
      !input.purpose ||
      input.requiredPermissions.length === 0
    ) {
      return {
        decision: 'INDETERMINATE',
        reasonCode: 'MANDATORY_CONTEXT_MISSING',
        reason: 'Mandatory authorization context is incomplete',
        obligations: ['DENY_EXECUTION', 'SUPPLY_COMPLETE_CONTEXT'],
      };
    }

    if (!input.applicable) {
      return {
        decision: 'NOT_APPLICABLE',
        reasonCode: 'POLICY_NOT_APPLICABLE',
        reason: 'The requested policy does not apply to this context',
        obligations: ['DENY_EXECUTION'],
      };
    }

    if (input.resourceTenantId !== input.tenantId) {
      return {
        decision: 'DENY',
        reasonCode: 'CROSS_TENANT_RESOURCE',
        reason: 'The resource tenant does not match the authorized tenant',
        obligations: ['DENY_EXECUTION', 'AUDIT_ISOLATION_VIOLATION'],
      };
    }

    if (input.riskState && BLOCKED_RISK_STATES.has(input.riskState)) {
      return {
        decision: 'DENY',
        reasonCode: 'RISK_BLOCKED',
        reason: 'The current principal risk state prohibits this action',
        obligations: ['DENY_EXECUTION', 'SECURITY_REVIEW'],
      };
    }

    if (
      input.requiredAssurance?.length &&
      (!input.assurance || !input.requiredAssurance.includes(input.assurance))
    ) {
      return {
        decision: 'DENY',
        reasonCode: 'STEP_UP_REQUIRED',
        reason: 'The current authentication assurance is insufficient',
        obligations: ['DENY_EXECUTION', 'REQUIRE_FRESH_STEP_UP'],
      };
    }

    if (
      !(await this.authorizationService.hasTenantAccess(
        input.tenantId,
        input.actorId,
      ))
    ) {
      return {
        decision: 'DENY',
        reasonCode: 'ACTIVE_MEMBERSHIP_REQUIRED',
        reason: 'The actor has no active membership for this tenant',
        obligations: ['DENY_EXECUTION'],
      };
    }

    const grantedPermissions =
      await this.authorizationService.getPermissionCodesForPrincipal(
        input.tenantId,
        input.actorId,
      );
    const missingPermissions = input.requiredPermissions.filter(
      (permission) => !grantedPermissions.includes(permission),
    );
    if (missingPermissions.length > 0) {
      return {
        decision: 'DENY',
        reasonCode: 'PERMISSION_REQUIRED',
        reason: `Actor lacks required permission(s): ${missingPermissions.join(', ')}`,
        obligations: ['DENY_EXECUTION'],
      };
    }

    if (input.requiredEntitlement) {
      const now = new Date();
      const entitlement = await this.prisma.entitlement.findFirst({
        where: {
          tenant_id: input.tenantId,
          offer_type: input.requiredEntitlement,
          status: 'ACTIVE',
          effective_from: { lte: now },
          OR: [{ effective_to: null }, { effective_to: { gt: now } }],
        },
        select: { id: true },
      });
      if (!entitlement) {
        return {
          decision: 'DENY',
          reasonCode: 'ACTIVE_ENTITLEMENT_REQUIRED',
          reason: `Tenant lacks active entitlement '${input.requiredEntitlement}'`,
          obligations: ['DENY_EXECUTION'],
        };
      }
    }

    if (input.requiredRelationship) {
      if (!input.resourceId) {
        return {
          decision: 'INDETERMINATE',
          reasonCode: 'RELATIONSHIP_RESOURCE_MISSING',
          reason: 'Relationship policy requires a resource identifier',
          obligations: ['DENY_EXECUTION', 'SUPPLY_COMPLETE_CONTEXT'],
        };
      }
      const now = new Date();
      const relationship = await this.prisma.relationship.findFirst({
        where: {
          tenant_id: input.tenantId,
          subject_id: input.actorId,
          relation: input.requiredRelationship.relation,
          object_type:
            input.requiredRelationship.objectType ?? input.resourceType,
          object_id: input.resourceId,
          OR: [{ valid_from: null }, { valid_from: { lte: now } }],
          AND: [{ OR: [{ valid_until: null }, { valid_until: { gt: now } }] }],
        },
        select: { id: true },
      });
      if (!relationship) {
        return {
          decision: 'DENY',
          reasonCode: 'RELATIONSHIP_REQUIRED',
          reason: `Actor lacks required relationship '${input.requiredRelationship.relation}'`,
          obligations: ['DENY_EXECUTION'],
        };
      }
    }

    return {
      decision: 'PERMIT',
      reasonCode: 'POLICY_PERMIT',
      reason:
        'Current membership, permissions and policy context permit the action',
      obligations: this.permitObligations(input.effectClass),
    };
  }

  private permitObligations(effectClass: AuthorizationEffectClass): string[] {
    if (effectClass === 'READ') return ['AUDIT_MATERIAL_READ'];
    if (effectClass === 'EXPORT') {
      return ['AUDIT_WRITE', 'REAUTHORIZE_DOWNLOAD', 'WATERMARK_EXPORT'];
    }
    return ['AUDIT_WRITE'];
  }

  private contextHash(
    input: ReturnType<AuthorizationDecisionService['normalize']>,
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          actorId: input.actorId,
          tenantId: input.tenantId,
          environmentId: input.environmentId,
          action: input.action,
          effectClass: input.effectClass,
          resourceType: input.resourceType,
          resourceId: input.resourceId ?? null,
          resourceTenantId: input.resourceTenantId,
          purpose: input.purpose,
          requiredPermissions: input.requiredPermissions,
          requiredEntitlement: input.requiredEntitlement ?? null,
          requiredRelationship: input.requiredRelationship ?? null,
          assurance: input.assurance ?? null,
          requiredAssurance: input.requiredAssurance ?? [],
          riskState: input.riskState ?? null,
          policyVersion: input.policyVersion,
        }),
      )
      .digest('hex');
  }
}
