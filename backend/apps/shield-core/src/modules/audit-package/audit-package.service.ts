import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboxService } from '../../outbox/outbox.service';
import { CANONICAL_TOPICS } from '../../kafka/kafka-producer.service';

export interface CreateAuditPackageInput {
  tenantId: string;
  continuousAssuranceProfileId: string;
  purpose: string;
  frameworkScope: string[];
  legalEntityScope?: string;
  environmentScope?: string;
  periodStart: Date;
  periodEnd: Date;
  createdBy: string;
  retentionUntil: Date;
  auditCycleReference: string;
}

@Injectable()
export class AuditPackageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async create(input: CreateAuditPackageInput) {
    if (
      !input.purpose.trim() ||
      !input.auditCycleReference.trim() ||
      !input.frameworkScope.length ||
      input.periodEnd <= input.periodStart ||
      input.retentionUntil < input.periodEnd
    ) {
      throw new BadRequestException(
        'Package requires purpose, audit cycle, framework scope, a valid period, and retention through at least period end',
      );
    }
    const profile = await this.prisma.continuousAssuranceProfile.findFirst({
      where: {
        id: input.continuousAssuranceProfileId,
        tenant_id: input.tenantId,
        status: 'ACTIVE',
        effective_from: { lte: input.periodStart },
        OR: [
          { effective_to: null },
          { effective_to: { gte: input.periodEnd } },
        ],
      },
    });
    if (!profile) {
      throw new ConflictException(
        'Audit packages require an ACTIVE Continuous Assurance profile covering the package period',
      );
    }
    const allowedFrameworks = new Set(
      JSON.parse(profile.framework_version_ids) as string[],
    );
    const frameworkScope = [...new Set(input.frameworkScope)];
    if (
      frameworkScope.length !== input.frameworkScope.length ||
      frameworkScope.some((id) => !allowedFrameworks.has(id))
    ) {
      throw new ConflictException(
        'Package framework scope must be unique and included in the contracted profile',
      );
    }
    const allowedLegalEntities = new Set(
      JSON.parse(profile.legal_entity_ids) as string[],
    );
    if (
      input.legalEntityScope &&
      !allowedLegalEntities.has(input.legalEntityScope)
    ) {
      throw new ConflictException(
        'Package legal-entity scope is outside the contracted profile',
      );
    }
    if (
      input.environmentScope &&
      input.environmentScope !== profile.environment_id
    ) {
      throw new ConflictException(
        'Package environment scope is outside the contracted profile',
      );
    }
    const packageId = randomUUID();
    const [pkg] = await this.prisma.$transaction([
      this.prisma.auditPackage.create({
        data: {
          id: packageId,
          tenant_id: input.tenantId,
          continuous_assurance_profile_id: profile.id,
          purpose: input.purpose,
          framework_scope: JSON.stringify(frameworkScope),
          legal_entity_scope: input.legalEntityScope,
          environment_scope: input.environmentScope ?? profile.environment_id,
          period_start: input.periodStart,
          period_end: input.periodEnd,
          created_by: input.createdBy,
          status: 'DRAFT',
          retention_profile: (
            JSON.parse(profile.evidence_retention_policy) as {
              profileRef?: string;
            }
          ).profileRef,
          retention_until: input.retentionUntil,
          audit_cycle_reference: input.auditCycleReference.trim(),
          claim_eligibility: false,
          claim_eligibility_reason: 'PACKAGE_NOT_VALIDATED',
        },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId: input.tenantId,
          topic: CANONICAL_TOPICS.AUDIT_PACKAGE_CREATED,
          eventType: 'audit_package.created',
          payload: { packageId },
        }),
      }),
    ]);
    return pkg;
  }

  /** Every mutating method across this subsystem checks status !== 'FROZEN' first — a frozen package never mutates (spec §39). */
  async assertMutable(tenantId: string, packageId: string) {
    const pkg = await this.assertTenantOwnership(tenantId, packageId);
    if (pkg.status === 'FROZEN' || pkg.status === 'SUPERSEDED') {
      throw new ForbiddenException(
        `AuditPackage '${packageId}' is ${pkg.status} and cannot be mutated — use supersede() to correct it`,
      );
    }
    return pkg;
  }

  async assertTenantOwnership(tenantId: string, packageId: string) {
    const pkg = await this.prisma.auditPackage.findFirst({
      where: { id: packageId, tenant_id: tenantId },
    });
    if (!pkg) {
      throw new NotFoundException(`AuditPackage '${packageId}' not found`);
    }
    return pkg;
  }

  async list(tenantId: string) {
    return this.prisma.auditPackage.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
    });
  }
}
