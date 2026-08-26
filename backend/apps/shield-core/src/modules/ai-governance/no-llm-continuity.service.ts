import { BadRequestException, Injectable } from '@nestjs/common';
import { IsIn, IsObject, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthorizationDecisionService } from '../authorization-decision/authorization-decision.service';
import { ContentHashService } from '../evidence/hashing/content-hash.service';

export const CONTINUITY_OPERATIONS = [
  'DETECTION_EVALUATION',
  'EVIDENCE_INTEGRITY',
  'AUTHORIZATION',
  'RESPONSE_SAFETY',
  'CORE_CASE_FALLBACK',
] as const;
export type ContinuityOperation = (typeof CONTINUITY_OPERATIONS)[number];

export class EvaluateNoLlmContinuityDto {
  @IsString()
  tenantId!: string;

  @IsString()
  environmentId!: string;

  @IsString()
  actorId!: string;

  @IsIn(CONTINUITY_OPERATIONS)
  operation!: ContinuityOperation;

  @IsObject()
  facts!: Record<string, unknown>;
}

/**
 * Explicit no-LLM continuity plane for deterministic detection, evidence,
 * authorization, response safety and basic case assistance.
 */
@Injectable()
export class NoLlmContinuityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationDecisionService,
    private readonly hashes: ContentHashService,
  ) {}

  private number(facts: Record<string, unknown>, key: string) {
    const value = Number(facts[key]);
    if (!Number.isFinite(value)) {
      throw new BadRequestException(`${key} must be a finite number`);
    }
    return value;
  }

  private string(facts: Record<string, unknown>, key: string) {
    const value = facts[key];
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${key} is required`);
    }
    return value.trim();
  }

  private async resolve(dto: EvaluateNoLlmContinuityDto) {
    switch (dto.operation) {
      case 'DETECTION_EVALUATION': {
        if (dto.facts.requiredFactsComplete !== true) {
          return {
            outcome: 'INDETERMINATE',
            reason: 'Required deterministic detection facts are incomplete',
            result: { match: null, confidence: 0, humanReviewRequired: true },
          };
        }
        const score = this.number(dto.facts, 'signalScore');
        const threshold = this.number(dto.facts, 'threshold');
        const match = score >= threshold;
        return {
          outcome: match ? 'MATCH' : 'NO_MATCH',
          reason: `Deterministic signal score ${score} evaluated against threshold ${threshold}`,
          result: { match, score, threshold, modelUsed: false },
        };
      }
      case 'EVIDENCE_INTEGRITY': {
        if (!Object.prototype.hasOwnProperty.call(dto.facts, 'evidence')) {
          throw new BadRequestException('evidence is required');
        }
        const { contentHash, canonicalBytes } = this.hashes.hashCanonicalJson(
          dto.facts.evidence,
        );
        return {
          outcome: 'HASHED',
          reason: 'Evidence canonicalized and hashed without AI',
          result: {
            contentHash,
            canonicalContent: canonicalBytes,
            modelUsed: false,
          },
        };
      }
      case 'AUTHORIZATION': {
        const decision = await this.authorization.evaluate({
          actorId: dto.actorId,
          tenantId: dto.tenantId,
          environmentId: dto.environmentId,
          action: this.string(dto.facts, 'action'),
          resourceType: this.string(dto.facts, 'resourceType'),
          resourceId:
            typeof dto.facts.resourceId === 'string'
              ? dto.facts.resourceId
              : undefined,
        });
        return {
          outcome: decision.decision,
          reason: `Deterministic authorization returned ${decision.reasonCode}`,
          authorizationRef: decision.authorizationDecisionId,
          result: {
            decision: decision.decision,
            reasonCode: decision.reasonCode,
            authorizationDecisionId: decision.authorizationDecisionId,
            modelUsed: false,
          },
        };
      }
      case 'RESPONSE_SAFETY': {
        const authorityLevel = this.string(dto.facts, 'authorityLevel');
        const authorityValid = /^R[0-4]$/.test(authorityLevel);
        const actionType =
          typeof dto.facts.actionType === 'string'
            ? dto.facts.actionType
            : '__NO_ACTION_TYPE__';
        const connectorScopeRef =
          typeof dto.facts.connectorScopeRef === 'string'
            ? dto.facts.connectorScopeRef
            : '__NO_CONNECTOR__';
        const activeFreeze = await this.prisma.freeze.findFirst({
          where: {
            active_from: { lte: new Date() },
            AND: [
              {
                OR: [
                  { active_until: null },
                  { active_until: { gt: new Date() } },
                ],
              },
              {
                OR: [
                  { scope: 'GLOBAL' },
                  { scope: 'TENANT', tenant_id: dto.tenantId },
                  {
                    scope: 'ACTION_TYPE',
                    tenant_id: dto.tenantId,
                    scope_ref: actionType,
                  },
                  {
                    scope: 'CONNECTOR',
                    tenant_id: dto.tenantId,
                    scope_ref: connectorScopeRef,
                  },
                ],
              },
            ],
          },
        });
        const reversible = dto.facts.reversible === true;
        const rollbackActionType = dto.facts.rollbackActionType;
        const permitted =
          !activeFreeze &&
          authorityValid &&
          ['R0', 'R1'].includes(authorityLevel) &&
          reversible &&
          typeof rollbackActionType === 'string' &&
          rollbackActionType.trim().length > 0;
        return {
          outcome: permitted ? 'PERMIT_SIMULATION_ONLY' : 'DENY',
          reason: activeFreeze
            ? `${activeFreeze.scope} response freeze is active`
            : !authorityValid
              ? 'Response authority must be one of R0 through R4'
              : !['R0', 'R1'].includes(authorityLevel)
                ? 'No-LLM continuity permits at most R1 simulation authority'
                : !reversible || !rollbackActionType
                  ? 'Response safety requires a reversible action and named rollback'
                  : 'Deterministic response safety checks passed for simulation only',
          result: {
            permitted,
            executionMode: permitted ? 'SIMULATION_ONLY' : 'BLOCKED',
            maximumAuthority: 'R1',
            modelUsed: false,
          },
        };
      }
      case 'CORE_CASE_FALLBACK': {
        const useCase = this.string(dto.facts, 'useCase');
        const caseId = this.string(dto.facts, 'caseId');
        return {
          outcome: 'DETERMINISTIC_FALLBACK',
          reason:
            'AI unavailable; returned factual core-case state without inference',
          result: {
            caseId,
            useCase,
            title: dto.facts.title,
            status: dto.facts.status,
            severity: dto.facts.severity,
            priority: dto.facts.priority,
            recommendation:
              useCase === 'RESPONSE_RECOMMENDATION'
                ? 'HUMAN_REVIEW_REQUIRED_NO_AUTOMATED_RESPONSE'
                : undefined,
            hypotheses: useCase === 'INVESTIGATION_HYPOTHESIS' ? [] : undefined,
            conclusion: null,
            limitations: [
              'AI_UNAVAILABLE',
              'Deterministic fallback contains recorded facts only',
              'No compliance, legal, causal or response-authority conclusion was generated',
            ],
            modelUsed: false,
          },
        };
      }
    }
  }

  async evaluate(dto: EvaluateNoLlmContinuityDto) {
    const input = {
      operation: dto.operation,
      tenantId: dto.tenantId,
      environmentId: dto.environmentId,
      actorId: dto.actorId,
      facts: dto.facts,
    };
    const resolved = await this.resolve(dto);
    const inputHash = this.hashes.hashCanonicalJson(input).contentHash;
    const outputHash = this.hashes.hashCanonicalJson(resolved).contentHash;
    const event = await this.prisma.deterministicContinuityEvent.create({
      data: {
        tenant_id: dto.tenantId,
        environment_id: dto.environmentId,
        operation: dto.operation,
        actor_id: dto.actorId,
        engine: 'SHIELD_CORE_DETERMINISTIC_V1',
        llm_used: false,
        input_hash: inputHash,
        output_hash: outputHash,
        outcome: resolved.outcome,
        reason: resolved.reason,
        authorization_ref:
          'authorizationRef' in resolved
            ? resolved.authorizationRef
            : undefined,
      },
    });
    return {
      continuityEventId: event.id,
      engine: event.engine,
      llmUsed: false,
      inputHash,
      outputHash,
      ...resolved,
    };
  }
}
