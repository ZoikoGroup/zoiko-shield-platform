import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SectorPackService } from '../sector-packs/sector-pack.service';
import { CommercialEntitlementService } from './commercial-entitlement.service';

export const CLAIM_CHANNELS = [
  'PRODUCT_UI',
  'API',
  'CONTRACT',
  'MARKETING',
  'TRUST_CENTER',
  'STATUS_PAGE',
  'SALES',
] as const;
export type ClaimChannel = (typeof CLAIM_CHANNELS)[number];

const CLAIM_REVIEWER_ROLES = ['LEGAL', 'COMPLIANCE'] as const;
export type ClaimReviewerRole = (typeof CLAIM_REVIEWER_ROLES)[number];

const OFFER_TYPES = [
  'MANAGED_DEFENSE',
  'CONTINUOUS_ASSURANCE',
  'EXPOSURE_MANAGEMENT',
  'AI_SECURITY',
] as const;

export class ClaimScopeDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  tenantIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  regions?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  sectorPackKeys?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  serviceTiers?: string[];
}

/**
 * A registration request is a proposal, never an approval. The two independent
 * review endpoints are the only path from PENDING_APPROVAL to APPROVED.
 */
export class RegisterClaimDto {
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{2,127}$/)
  claimKey!: string;

  @IsString()
  @MinLength(3)
  approvedWording!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(CLAIM_CHANNELS, { each: true })
  channels!: ClaimChannel[];

  @IsObject()
  @ValidateNested()
  @Type(() => ClaimScopeDto)
  scope!: ClaimScopeDto;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  evidenceRefs!: string[];

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  prohibitedVariants!: string[];

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  limitations!: string[];

  @IsIn(OFFER_TYPES)
  requiredOfferType!: (typeof OFFER_TYPES)[number];

  @IsOptional()
  @IsString()
  sectorPackKey?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8760)
  evidenceMaxAgeHours?: number;

  @IsString()
  @MinLength(3)
  monitoringReference!: string;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsISO8601()
  expiresAt!: string;

  @IsString()
  @MinLength(3)
  changeReason!: string;
}

export class DecideClaimDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  @MinLength(3)
  reason!: string;
}

export class RevokeClaimDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}

export interface ClaimEligibilityContext {
  tenantId: string;
  environmentId: string;
  region: string;
  claimKey: string;
  channel: ClaimChannel;
  sectorPackKey?: string;
}

export interface ClaimEligibilityResult {
  eligible: boolean;
  status: 'ELIGIBLE' | 'INELIGIBLE';
  reasonCode: string;
  reason: string;
  approvedWording: string | null;
  claimId: string | null;
  claimVersion: number | null;
  runtimeEvaluationId: string | null;
  evidenceRefs: string[];
  validUntil: Date | null;
}

@Injectable()
export class ClaimRegisterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlementService: CommercialEntitlementService,
    private readonly sectorPackService: SectorPackService,
  ) {}

  private parseArray(value: string | null | undefined): string[] {
    if (!value) return [];
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }

  private parseScope(value: string | null | undefined): ClaimScopeDto {
    if (!value) return {};
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private toView(claim: Record<string, unknown>) {
    return {
      ...claim,
      channels: this.parseArray(claim.channels as string),
      scope: this.parseScope(claim.scope as string),
      evidence_refs: this.parseArray(claim.evidence_refs as string),
      prohibited_variants: this.parseArray(claim.prohibited_variants as string),
      limitations: this.parseArray(claim.limitations as string),
    };
  }

  async registerClaim(dto: RegisterClaimDto, requestedBy: string) {
    const now = new Date();
    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : now;
    const expiresAt = new Date(dto.expiresAt);
    if (expiresAt <= now || expiresAt <= effectiveFrom) {
      throw new BadRequestException(
        'expiresAt must be in the future and later than effectiveFrom',
      );
    }

    const normalizedWording = dto.approvedWording.toLocaleLowerCase();
    const conflictingVariant = dto.prohibitedVariants.find((variant) =>
      normalizedWording.includes(variant.toLocaleLowerCase()),
    );
    if (conflictingVariant) {
      throw new BadRequestException(
        `Approved wording contains prohibited variant '${conflictingVariant}'`,
      );
    }

    const claim = await this.prisma.$transaction(
      async (tx) => {
        const latest = await tx.claimRegister.findFirst({
          where: { claim_key: dto.claimKey },
          orderBy: { version: 'desc' },
        });
        if (latest?.status === 'PENDING_APPROVAL') {
          throw new ConflictException(
            `Claim '${dto.claimKey}' already has version ${latest.version} pending approval`,
          );
        }
        const created = await tx.claimRegister.create({
          data: {
            claim_key: dto.claimKey,
            version: (latest?.version ?? 0) + 1,
            approved_wording: dto.approvedWording,
            channels: JSON.stringify(dto.channels),
            scope: JSON.stringify(dto.scope),
            evidence_refs: JSON.stringify(dto.evidenceRefs),
            prohibited_variants: JSON.stringify(dto.prohibitedVariants),
            limitations: JSON.stringify(dto.limitations),
            required_offer_type: dto.requiredOfferType,
            sector_pack_key: dto.sectorPackKey,
            evidence_max_age_hours: dto.evidenceMaxAgeHours ?? 24,
            monitoring_reference: dto.monitoringReference,
            status: 'PENDING_APPROVAL',
            requested_by: requestedBy,
            effective_from: effectiveFrom,
            expires_at: expiresAt,
            supersedes_id: latest?.id,
          },
        });
        await tx.commercialEvent.create({
          data: {
            event_type: 'claim.registration_requested',
            actor: requestedBy,
            payload: JSON.stringify({
              claimId: created.id,
              claimKey: created.claim_key,
              version: created.version,
              changeReason: dto.changeReason,
            }),
            idempotency_key: `claim-registration-${created.id}`,
          },
        });
        return created;
      },
      { isolationLevel: 'Serializable' },
    );
    return this.toView(claim);
  }

  async listClaims(claimKey?: string, status?: string) {
    const claims = await this.prisma.claimRegister.findMany({
      where: {
        ...(claimKey ? { claim_key: claimKey } : {}),
        ...(status ? { status } : {}),
      },
      include: { approvals: true },
      orderBy: [{ claim_key: 'asc' }, { version: 'desc' }],
    });
    return claims.map((claim) =>
      this.toView(claim as unknown as Record<string, unknown>),
    );
  }

  async getClaimById(id: string) {
    const claim = await this.prisma.claimRegister.findUnique({
      where: { id },
      include: { approvals: true },
    });
    if (!claim) {
      throw new NotFoundException(`Claim registration '${id}' not found`);
    }
    return this.toView(claim);
  }

  async decideClaim(
    id: string,
    reviewerRole: ClaimReviewerRole,
    reviewerId: string,
    dto: DecideClaimDto,
  ) {
    const expired = await this.prisma.$transaction(
      async (tx) => {
        const claim = await tx.claimRegister.findUnique({
          where: { id },
          include: { approvals: true },
        });
        if (!claim) {
          throw new NotFoundException(`Claim registration '${id}' not found`);
        }
        if (claim.status !== 'PENDING_APPROVAL') {
          throw new ConflictException(
            `Claim registration '${id}' is '${claim.status}', not PENDING_APPROVAL`,
          );
        }
        if (claim.expires_at <= new Date()) {
          await tx.claimRegister.update({
            where: { id },
            data: { status: 'EXPIRED' },
          });
          await tx.commercialEvent.create({
            data: {
              event_type: 'claim.expired',
              actor: reviewerId,
              payload: JSON.stringify({ claimId: id }),
              idempotency_key: `claim-expired-${id}`,
            },
          });
          return true;
        }
        if (claim.requested_by === reviewerId) {
          throw new ForbiddenException(
            'The claim author cannot approve or reject their own registration',
          );
        }
        if (
          claim.approvals.some(
            (approval) => approval.reviewer_role === reviewerRole,
          )
        ) {
          throw new ConflictException(
            `${reviewerRole} has already reviewed claim registration '${id}'`,
          );
        }
        if (
          claim.approvals.some(
            (approval) =>
              approval.decision === 'APPROVED' &&
              approval.reviewer_id === reviewerId,
          )
        ) {
          throw new ForbiddenException(
            'Legal and Compliance approvals must come from different principals',
          );
        }

        await tx.claimApproval.create({
          data: {
            claim_register_id: id,
            reviewer_role: reviewerRole,
            reviewer_id: reviewerId,
            decision: dto.decision,
            reason: dto.reason,
          },
        });

        let finalStatus = claim.status;
        if (dto.decision === 'REJECTED') {
          finalStatus = 'REJECTED';
          await tx.claimRegister.update({
            where: { id },
            data: { status: finalStatus },
          });
        } else {
          const approvedRoles = new Set(
            claim.approvals
              .filter((approval) => approval.decision === 'APPROVED')
              .map((approval) => approval.reviewer_role),
          );
          approvedRoles.add(reviewerRole);
          const fullyApproved = CLAIM_REVIEWER_ROLES.every((role) =>
            approvedRoles.has(role),
          );
          if (fullyApproved) {
            finalStatus = 'APPROVED';
            await tx.claimRegister.updateMany({
              where: {
                claim_key: claim.claim_key,
                status: 'APPROVED',
                id: { not: id },
              },
              data: { status: 'SUPERSEDED' },
            });
            await tx.claimRegister.update({
              where: { id },
              data: {
                status: finalStatus,
                verification_date: new Date(),
              },
            });
          }
        }

        await tx.commercialEvent.create({
          data: {
            event_type: `claim.review_${dto.decision.toLowerCase()}`,
            actor: reviewerId,
            payload: JSON.stringify({
              claimId: id,
              claimKey: claim.claim_key,
              version: claim.version,
              reviewerRole,
              decision: dto.decision,
              reason: dto.reason,
              resultingStatus: finalStatus,
            }),
            idempotency_key: `claim-review-${id}-${reviewerRole}`,
          },
        });
        return false;
      },
      { isolationLevel: 'Serializable' },
    );

    if (expired) {
      throw new ConflictException(`Claim registration '${id}' has expired`);
    }

    return this.getClaimById(id);
  }

  async revokeClaim(id: string, revokedBy: string, reason: string) {
    const claim = await this.prisma.claimRegister.findUnique({
      where: { id },
    });
    if (!claim) {
      throw new NotFoundException(`Claim registration '${id}' not found`);
    }
    if (claim.status !== 'APPROVED') {
      throw new ConflictException(
        `Only an APPROVED claim may be revoked; '${id}' is '${claim.status}'`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.claimRegister.update({
        where: { id },
        data: {
          status: 'REVOKED',
          revoked_by: revokedBy,
          revoked_at: new Date(),
          revocation_reason: reason,
        },
      });
      await tx.commercialEvent.create({
        data: {
          event_type: 'claim.revoked',
          actor: revokedBy,
          payload: JSON.stringify({
            claimId: id,
            claimKey: claim.claim_key,
            version: claim.version,
            reason,
          }),
          idempotency_key: `claim-revoked-${id}`,
        },
      });
    });
    return this.getClaimById(id);
  }

  private contextKey(context: ClaimEligibilityContext): string {
    return createHash('sha256')
      .update(
        [
          context.tenantId,
          context.environmentId,
          context.region,
          context.claimKey,
          context.channel,
          context.sectorPackKey ?? '',
        ].join('\u0000'),
      )
      .digest('hex');
  }

  private async recordEligibility(
    context: ClaimEligibilityContext,
    result: ClaimEligibilityResult,
  ) {
    const contextKey = this.contextKey(context);
    const existing = await this.prisma.claimEligibility.findUnique({
      where: { context_key: contextKey },
    });
    const changed =
      !existing ||
      existing.status !== result.status ||
      existing.reason_code !== result.reasonCode ||
      existing.claim_register_id !== result.claimId ||
      existing.runtime_evaluation_id !== result.runtimeEvaluationId;

    await this.prisma.$transaction(async (tx) => {
      const eligibility = await tx.claimEligibility.upsert({
        where: { context_key: contextKey },
        update: {
          claim_register_id: result.claimId,
          claim_version: result.claimVersion,
          status: result.status,
          reason_code: result.reasonCode,
          reason: result.reason,
          approved_wording: result.approvedWording,
          runtime_evaluation_id: result.runtimeEvaluationId,
          evidence_refs: JSON.stringify(result.evidenceRefs),
          evaluated_at: new Date(),
          valid_until: result.validUntil,
        },
        create: {
          tenant_id: context.tenantId,
          environment_id: context.environmentId,
          region: context.region,
          context_key: contextKey,
          claim_key: context.claimKey,
          claim_register_id: result.claimId,
          claim_version: result.claimVersion,
          channel: context.channel,
          sector_pack_key: context.sectorPackKey,
          status: result.status,
          reason_code: result.reasonCode,
          reason: result.reason,
          approved_wording: result.approvedWording,
          runtime_evaluation_id: result.runtimeEvaluationId,
          evidence_refs: JSON.stringify(result.evidenceRefs),
          evaluated_at: new Date(),
          valid_until: result.validUntil,
        },
      });
      await tx.bundleClaimEligibility.updateMany({
        where: {
          tenant_id: context.tenantId,
          environment_id: context.environmentId,
          region: context.region,
          claim_key: context.claimKey,
          channel: context.channel,
        },
        data: {
          status: result.status,
          reason_code: result.reasonCode,
          evaluated_eligibility_id: eligibility.id,
        },
      });
      if (changed) {
        await tx.commercialEvent.create({
          data: {
            event_type: 'claim_eligibility.changed',
            tenant_id: context.tenantId,
            actor: 'claim-policy-engine',
            payload: JSON.stringify({
              environmentId: context.environmentId,
              region: context.region,
              claimKey: context.claimKey,
              claimVersion: result.claimVersion,
              channel: context.channel,
              previousStatus: existing?.status ?? null,
              status: result.status,
              reasonCode: result.reasonCode,
            }),
            idempotency_key: `claim-eligibility-${contextKey}-${randomUUID()}`,
          },
        });
      }
    });

    return result;
  }

  private ineligible(
    reasonCode: string,
    reason: string,
    claim?: { id: string; version: number },
  ): ClaimEligibilityResult {
    return {
      eligible: false,
      status: 'INELIGIBLE',
      reasonCode,
      reason,
      approvedWording: null,
      claimId: claim?.id ?? null,
      claimVersion: claim?.version ?? null,
      runtimeEvaluationId: null,
      evidenceRefs: [],
      validUntil: null,
    };
  }

  /**
   * Reconciles the approved R17 record with channel/scope, purchased
   * entitlement, sector-pack availability, and fresh integrity-verified
   * runtime evidence. Every unknown or stale condition fails closed.
   */
  async verifyClaimEligibility(context: ClaimEligibilityContext) {
    const now = new Date();
    const claim = await this.prisma.claimRegister.findFirst({
      where: {
        claim_key: context.claimKey,
        status: 'APPROVED',
        effective_from: { lte: now },
        expires_at: { gt: now },
      },
      orderBy: { version: 'desc' },
    });

    if (!claim) {
      const latest = await this.prisma.claimRegister.findFirst({
        where: { claim_key: context.claimKey },
        orderBy: { version: 'desc' },
      });
      const result = this.ineligible(
        latest ? `CLAIM_${latest.status}` : 'CLAIM_NOT_REGISTERED',
        latest
          ? `Claim '${context.claimKey}' has no currently effective approved version (latest status: ${latest.status})`
          : `Claim '${context.claimKey}' is not registered`,
        latest ?? undefined,
      );
      return this.recordEligibility(context, result);
    }

    const claimIdentity = { id: claim.id, version: claim.version };
    const sectorPackKey = claim.sector_pack_key ?? context.sectorPackKey;
    const recordContext: ClaimEligibilityContext = {
      ...context,
      sectorPackKey,
    };
    const channels = this.parseArray(claim.channels);
    if (!channels.includes(context.channel)) {
      return this.recordEligibility(
        recordContext,
        this.ineligible(
          'CHANNEL_NOT_APPROVED',
          `Claim '${context.claimKey}' is not approved for channel '${context.channel}'`,
          claimIdentity,
        ),
      );
    }

    const scope = this.parseScope(claim.scope);
    if (
      scope.tenantIds?.length &&
      !scope.tenantIds.includes(context.tenantId)
    ) {
      return this.recordEligibility(
        recordContext,
        this.ineligible(
          'TENANT_OUT_OF_SCOPE',
          `Tenant '${context.tenantId}' is outside the approved claim scope`,
          claimIdentity,
        ),
      );
    }
    if (scope.regions?.length && !scope.regions.includes(context.region)) {
      return this.recordEligibility(
        recordContext,
        this.ineligible(
          'REGION_OUT_OF_SCOPE',
          `Region '${context.region}' is outside the approved claim scope`,
          claimIdentity,
        ),
      );
    }

    const evidenceRefs = this.parseArray(claim.evidence_refs);
    if (evidenceRefs.length === 0) {
      return this.recordEligibility(
        recordContext,
        this.ineligible(
          'CLAIM_APPROVAL_EVIDENCE_MISSING',
          `Claim '${context.claimKey}' has no approval evidence`,
          claimIdentity,
        ),
      );
    }

    const hasEntitlement = await this.entitlementService.checkEntitlement(
      context.tenantId,
      claim.required_offer_type,
    );
    if (!hasEntitlement) {
      return this.recordEligibility(
        recordContext,
        this.ineligible(
          'REQUIRED_ENTITLEMENT_MISSING',
          `Tenant '${context.tenantId}' lacks active '${claim.required_offer_type}' entitlement`,
          claimIdentity,
        ),
      );
    }

    const scopedSectorPacks = scope.sectorPackKeys ?? [];
    if (scopedSectorPacks.length > 0 && !sectorPackKey) {
      return this.recordEligibility(
        recordContext,
        this.ineligible(
          'SECTOR_PACK_REQUIRED',
          `Claim '${context.claimKey}' requires an approved sector pack`,
          claimIdentity,
        ),
      );
    }
    if (
      sectorPackKey &&
      scopedSectorPacks.length > 0 &&
      !scopedSectorPacks.includes(sectorPackKey)
    ) {
      return this.recordEligibility(
        recordContext,
        this.ineligible(
          'SECTOR_PACK_OUT_OF_SCOPE',
          `Sector pack '${sectorPackKey}' is outside the approved claim scope`,
          claimIdentity,
        ),
      );
    }
    if (
      claim.sector_pack_key &&
      context.sectorPackKey &&
      claim.sector_pack_key !== context.sectorPackKey
    ) {
      return this.recordEligibility(
        recordContext,
        this.ineligible(
          'SECTOR_PACK_MISMATCH',
          `Claim '${context.claimKey}' requires sector pack '${claim.sector_pack_key}'`,
          claimIdentity,
        ),
      );
    }
    if (sectorPackKey) {
      const available = await this.sectorPackService.isAvailable(
        sectorPackKey,
        context.region,
      );
      if (!available) {
        return this.recordEligibility(
          recordContext,
          this.ineligible(
            'SECTOR_PACK_UNAVAILABLE',
            `Sector pack '${sectorPackKey}' is not approved, licensed, and available in '${context.region}'`,
            claimIdentity,
          ),
        );
      }
    }

    const evidenceCutoff = new Date(
      now.getTime() - claim.evidence_max_age_hours * 60 * 60 * 1000,
    );
    const runtimeEvaluation = await this.prisma.claimEvaluation.findFirst({
      where: {
        tenant_id: context.tenantId,
        claim_type: context.claimKey,
        result: 'QUALIFIED',
        evaluated_at: { gte: evidenceCutoff, lte: now },
      },
      orderBy: { evaluated_at: 'desc' },
    });
    if (!runtimeEvaluation) {
      return this.recordEligibility(
        recordContext,
        this.ineligible(
          'CURRENT_RUNTIME_EVIDENCE_MISSING',
          `No fresh qualified runtime evaluation supports claim '${context.claimKey}'`,
          claimIdentity,
        ),
      );
    }

    const runtimeEvidenceRefs = [
      ...new Set(this.parseArray(runtimeEvaluation.evidence_ids)),
    ];
    if (runtimeEvidenceRefs.length === 0) {
      return this.recordEligibility(
        recordContext,
        this.ineligible(
          'RUNTIME_EVIDENCE_EMPTY',
          `Runtime evaluation '${runtimeEvaluation.id}' has no evidence references`,
          claimIdentity,
        ),
      );
    }
    const verifiedEvidence = await this.prisma.evidenceRecord.findMany({
      where: {
        id: { in: runtimeEvidenceRefs },
        tenant_id: context.tenantId,
        integrity_state: 'VERIFIED',
        freshness_state: 'CURRENT',
      },
      select: { id: true },
    });
    if (verifiedEvidence.length !== runtimeEvidenceRefs.length) {
      return this.recordEligibility(
        recordContext,
        this.ineligible(
          'RUNTIME_EVIDENCE_UNVERIFIED',
          `Runtime evidence for claim '${context.claimKey}' is missing, stale, cross-tenant, or integrity-unverified`,
          claimIdentity,
        ),
      );
    }

    const evidenceValidUntil = new Date(
      runtimeEvaluation.evaluated_at.getTime() +
        claim.evidence_max_age_hours * 60 * 60 * 1000,
    );
    const validUntil =
      evidenceValidUntil < claim.expires_at
        ? evidenceValidUntil
        : claim.expires_at;
    return this.recordEligibility(recordContext, {
      eligible: true,
      status: 'ELIGIBLE',
      reasonCode: 'CLAIM_ELIGIBLE',
      reason: `Claim '${context.claimKey}' is approved and supported by current evidence`,
      approvedWording: claim.approved_wording,
      claimId: claim.id,
      claimVersion: claim.version,
      runtimeEvaluationId: runtimeEvaluation.id,
      evidenceRefs: [...evidenceRefs, ...runtimeEvidenceRefs],
      validUntil,
    });
  }
}
