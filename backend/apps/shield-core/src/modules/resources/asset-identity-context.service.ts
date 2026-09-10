import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type CriticalityTier =
  | 'TIER_0_MISSION_CRITICAL'
  | 'TIER_1_BUSINESS_CRITICAL'
  | 'TIER_2_OPERATIONAL'
  | 'TIER_3_DEVELOPMENT';

export type ServiceDowntimeScope =
  'NONE' | 'ISOLATED_HOST' | 'TENANT_DEGRADED' | 'SERVICE_INTERRUPTED';

export type BlastRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ActorIdentityContext {
  tenantId: string;
  actorType: 'USER' | 'WORKLOAD_SERVICE_ACCOUNT' | 'HOST' | 'CLOUD_ROLE';
  actorId: string;
  displayName?: string;
  department?: string;
  privilegedRoles: string[];
  criticalityTier: CriticalityTier;
  activeSessionsCount: number;
  dependentServices: string[];
  lastObservedAt: Date;
}

export interface CollateralFactor {
  factor: string;
  weight: number;
  description: string;
}

export interface RollbackCompensationPlan {
  compensationActionType: string;
  targetId: string;
  rollbackParameters: Record<string, unknown>;
  estimatedReversalTimeSec: number;
  isFullyAutomated: boolean;
}

export interface BlastRadiusAssessment {
  tenantId: string;
  actorId: string;
  actionType: string;
  score: number; // 0.00 - 1.00
  riskLevel: BlastRiskLevel;
  impactedUsersCount: number;
  serviceDowntime: ServiceDowntimeScope;
  collateralFactors: CollateralFactor[];
  isSafeForAutomatedRecommendation: boolean;
  rollbackCompensation: RollbackCompensationPlan;
  evaluatedAt: Date;
}

/**
 * Asset & Identity Graph Context Correlation Service (Master Build Plan §3.2 & §20).
 * Correlates normalized OCSF actors with identity entitlement graphs to evaluate
 * blast radius, collateral operational risk, and reverse compensation descriptors.
 */
@Injectable()
export class AssetIdentityContextService {
  private readonly logger = new Logger(AssetIdentityContextService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Correlates an actor identifier against local identity records or directory heuristics.
   */
  async correlateActor(
    tenantId: string,
    actorId: string,
    hints?: Partial<ActorIdentityContext>,
  ): Promise<ActorIdentityContext> {
    // Attempt local identity lookup if matching email/principal pattern
    let isPrivileged = false;
    const privilegedKeywords = [
      'admin',
      'secops',
      'root',
      'infra',
      'ciso',
      'devops',
      'break-glass',
    ];
    const actorLower = actorId.toLowerCase();

    if (privilegedKeywords.some((kw) => actorLower.includes(kw))) {
      isPrivileged = true;
    }

    const defaultTier: CriticalityTier = isPrivileged
      ? 'TIER_0_MISSION_CRITICAL'
      : actorId.includes('host') || actorId.includes('srv-')
        ? 'TIER_1_BUSINESS_CRITICAL'
        : 'TIER_2_OPERATIONAL';

    return {
      tenantId,
      actorType:
        hints?.actorType ??
        (actorId.includes('@')
          ? 'USER'
          : actorId.startsWith('arn:')
            ? 'CLOUD_ROLE'
            : 'HOST'),
      actorId,
      displayName: hints?.displayName ?? actorId.split('@')[0],
      department:
        hints?.department ??
        (isPrivileged ? 'Security Engineering' : 'Corporate IT'),
      privilegedRoles:
        hints?.privilegedRoles ??
        (isPrivileged ? ['SecurityAdmin', 'GlobalReader'] : ['StandardUser']),
      criticalityTier: hints?.criticalityTier ?? defaultTier,
      activeSessionsCount: hints?.activeSessionsCount ?? (isPrivileged ? 3 : 1),
      dependentServices:
        hints?.dependentServices ??
        (isPrivileged ? ['prod-auth-gateway', 'audit-pipeline'] : []),
      lastObservedAt: hints?.lastObservedAt ?? new Date(),
    };
  }

  /**
   * Computes blast-radius score (0.00 to 1.00) and collateral impact for containment actions.
   */
  async calculateBlastRadius(params: {
    tenantId: string;
    actorId: string;
    actionType: string;
    targetResource?: string;
    customContext?: Partial<ActorIdentityContext>;
  }): Promise<BlastRadiusAssessment> {
    const context = await this.correlateActor(
      params.tenantId,
      params.actorId,
      params.customContext,
    );

    const collateralFactors: CollateralFactor[] = [];
    let score = 0.05; // Baseline minimum risk

    // 1. Criticality Tier evaluation
    switch (context.criticalityTier) {
      case 'TIER_0_MISSION_CRITICAL':
        score += 0.4;
        collateralFactors.push({
          factor: 'CRITICALITY_TIER_0',
          weight: 0.4,
          description:
            'Target actor holds mission-critical operational authority or Tier-0 access.',
        });
        break;
      case 'TIER_1_BUSINESS_CRITICAL':
        score += 0.25;
        collateralFactors.push({
          factor: 'CRITICALITY_TIER_1',
          weight: 0.25,
          description: 'Target actor holds business-critical system access.',
        });
        break;
      case 'TIER_2_OPERATIONAL':
        score += 0.1;
        collateralFactors.push({
          factor: 'CRITICALITY_TIER_2',
          weight: 0.1,
          description:
            'Standard operational workload or standard business identity.',
        });
        break;
      default:
        score += 0.02;
    }

    // 2. Privileged Roles Impact
    if (context.privilegedRoles.length > 0) {
      const privWeight = Math.min(0.2, context.privilegedRoles.length * 0.08);
      score += privWeight;
      collateralFactors.push({
        factor: 'PRIVILEGED_ROLES',
        weight: privWeight,
        description: `Target actor holds ${context.privilegedRoles.length} privileged role(s): ${context.privilegedRoles.join(', ')}`,
      });
    }

    // 3. Dependent Services Impact
    if (context.dependentServices.length > 0) {
      const depWeight = Math.min(0.25, context.dependentServices.length * 0.1);
      score += depWeight;
      collateralFactors.push({
        factor: 'DOWNSTREAM_SERVICES',
        weight: depWeight,
        description: `Action potentially affects ${context.dependentServices.length} downstream service(s).`,
      });
    }

    // 4. Action Type Severity Weight
    let serviceDowntime: ServiceDowntimeScope = 'NONE';
    const actionUpper = params.actionType.toUpperCase();
    if (actionUpper.includes('ISOLATE') || actionUpper.includes('QUARANTINE')) {
      score += 0.15;
      serviceDowntime = 'ISOLATED_HOST';
      collateralFactors.push({
        factor: 'CONTAINMENT_ISOLATION',
        weight: 0.15,
        description:
          'Network or host isolation restricts all inbound/outbound communication.',
      });
    } else if (
      actionUpper.includes('TERMINATE') ||
      actionUpper.includes('REVOKE')
    ) {
      score += 0.08;
      serviceDowntime = 'NONE';
      collateralFactors.push({
        factor: 'SESSION_REVOCATION',
        weight: 0.08,
        description:
          'Active credentials and authentication tokens will be invalidated.',
      });
    }

    // Normalized clamped score (0.00 - 1.00)
    const finalScore = Math.min(1.0, Math.max(0.0, Number(score.toFixed(2))));

    let riskLevel: BlastRiskLevel = 'LOW';
    if (finalScore >= 0.7) riskLevel = 'CRITICAL';
    else if (finalScore >= 0.45) riskLevel = 'HIGH';
    else if (finalScore >= 0.25) riskLevel = 'MEDIUM';

    const isSafeForAutomatedRecommendation = finalScore <= 0.65;
    const rollbackCompensation = this.generateRollbackCompensation(
      params.actionType,
      params.targetResource || params.actorId,
      context,
    );

    return {
      tenantId: params.tenantId,
      actorId: params.actorId,
      actionType: params.actionType,
      score: finalScore,
      riskLevel,
      impactedUsersCount: context.activeSessionsCount,
      serviceDowntime,
      collateralFactors,
      isSafeForAutomatedRecommendation,
      rollbackCompensation,
      evaluatedAt: new Date(),
    };
  }

  /**
   * Generates deterministic rollback compensation descriptors for containment actions.
   */
  generateRollbackCompensation(
    actionType: string,
    targetId: string,
    context: ActorIdentityContext,
  ): RollbackCompensationPlan {
    const actionUpper = actionType.toUpperCase();

    if (
      actionUpper.includes('ISOLATE_HOST') ||
      actionUpper.includes('EDR_ISOLATION')
    ) {
      return {
        compensationActionType: 'UNISOLATE_EDR_HOST',
        targetId,
        rollbackParameters: {
          targetHost: targetId,
          reconnectVlan: true,
          restoreNetworkPolicy: true,
        },
        estimatedReversalTimeSec: 15,
        isFullyAutomated: true,
      };
    }

    if (
      actionUpper.includes('RESET_USER_SESSIONS') ||
      actionUpper.includes('REVOKE_TOKENS')
    ) {
      return {
        compensationActionType: 'RESTORE_USER_SESSION_CACHE',
        targetId,
        rollbackParameters: {
          userId: targetId,
          allowImmediateReauthentication: true,
          notifyUserViaSms: false,
        },
        estimatedReversalTimeSec: 5,
        isFullyAutomated: true,
      };
    }

    if (
      actionUpper.includes('QUARANTINE_FILE') ||
      actionUpper.includes('BLOCK_HASH')
    ) {
      return {
        compensationActionType: 'RESTORE_QUARANTINED_FILE',
        targetId,
        rollbackParameters: {
          fileSha256: targetId,
          removeFromDenylist: true,
        },
        estimatedReversalTimeSec: 30,
        isFullyAutomated: true,
      };
    }

    return {
      compensationActionType: 'REVERT_GENERIC_CONTAINMENT',
      targetId,
      rollbackParameters: {
        originalAction: actionType,
        targetId,
      },
      estimatedReversalTimeSec: 60,
      isFullyAutomated: false,
    };
  }
}
