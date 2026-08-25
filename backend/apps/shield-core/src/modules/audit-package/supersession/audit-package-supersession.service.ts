import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CANONICAL_TOPICS } from '../../../kafka/kafka-producer.service';
import { AuditPackageService } from '../audit-package.service';
import { AuditPackageStateMachineService } from '../audit-package-state-machine.service';

/**
 * A frozen package is never edited — an error is corrected by superseding
 * it with a new DRAFT package (spec §40). The original stays independently
 * verifiable forever.
 */
@Injectable()
export class AuditPackageSupersessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly auditPackageService: AuditPackageService,
    private readonly stateMachine: AuditPackageStateMachineService,
  ) {}

  async supersede(tenantId: string, packageId: string, createdBy: string) {
    const pkg = await this.auditPackageService.assertTenantOwnership(
      tenantId,
      packageId,
    );
    if (pkg.status !== 'FROZEN') {
      throw new BadRequestException(
        `AuditPackage '${packageId}' must be FROZEN before it can be superseded (currently ${pkg.status})`,
      );
    }
    this.stateMachine.assertValidTransition(pkg.status, 'SUPERSEDED');

    const newPackageId = randomUUID();
    const [, newPkg] = await this.prisma.$transaction([
      this.prisma.auditPackage.update({
        where: { id: pkg.id },
        data: { status: 'SUPERSEDED' },
      }),
      this.prisma.auditPackage.create({
        data: {
          id: newPackageId,
          tenant_id: tenantId,
          continuous_assurance_profile_id: pkg.continuous_assurance_profile_id,
          version: pkg.version + 1,
          purpose: pkg.purpose,
          framework_scope: pkg.framework_scope,
          legal_entity_scope: pkg.legal_entity_scope,
          environment_scope: pkg.environment_scope,
          period_start: pkg.period_start,
          period_end: pkg.period_end,
          created_by: createdBy,
          status: 'DRAFT',
          supersedes_package_id: pkg.id,
          retention_profile: pkg.retention_profile,
          retention_until: pkg.retention_until,
          audit_cycle_reference: pkg.audit_cycle_reference,
          claim_eligibility: false,
          claim_eligibility_reason: 'PACKAGE_NOT_VALIDATED',
        },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId,
          topic: CANONICAL_TOPICS.AUDIT_PACKAGE_SUPERSEDED,
          eventType: 'audit_package.superseded',
          payload: { oldPackageId: pkg.id, newPackageId },
        }),
      }),
    ]);
    return newPkg;
  }
}
