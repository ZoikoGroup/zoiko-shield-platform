import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboxService } from '../../outbox/outbox.service';
import { CANONICAL_TOPICS } from '../../kafka/kafka-producer.service';

export interface CreateAuditPackageInput {
  tenantId: string;
  purpose: string;
  frameworkScope: string[];
  legalEntityScope?: string;
  environmentScope?: string;
  periodStart: Date;
  periodEnd: Date;
  createdBy: string;
}

@Injectable()
export class AuditPackageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async create(input: CreateAuditPackageInput) {
    const packageId = randomUUID();
    const [pkg] = await this.prisma.$transaction([
      this.prisma.auditPackage.create({
        data: {
          id: packageId,
          tenant_id: input.tenantId,
          purpose: input.purpose,
          framework_scope: JSON.stringify(input.frameworkScope),
          legal_entity_scope: input.legalEntityScope,
          environment_scope: input.environmentScope,
          period_start: input.periodStart,
          period_end: input.periodEnd,
          created_by: input.createdBy,
          status: 'DRAFT',
        },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({ tenantId: input.tenantId, topic: CANONICAL_TOPICS.AUDIT_PACKAGE_CREATED, eventType: 'audit_package.created', payload: { packageId } }),
      }),
    ]);
    return pkg;
  }

  /** Every mutating method across this subsystem checks status !== 'FROZEN' first — a frozen package never mutates (spec §39). */
  async assertMutable(tenantId: string, packageId: string) {
    const pkg = await this.assertTenantOwnership(tenantId, packageId);
    if (pkg.status === 'FROZEN' || pkg.status === 'SUPERSEDED') {
      throw new ForbiddenException(`AuditPackage '${packageId}' is ${pkg.status} and cannot be mutated — use supersede() to correct it`);
    }
    return pkg;
  }

  async assertTenantOwnership(tenantId: string, packageId: string) {
    const pkg = await this.prisma.auditPackage.findFirst({ where: { id: packageId, tenant_id: tenantId } });
    if (!pkg) {
      throw new NotFoundException(`AuditPackage '${packageId}' not found`);
    }
    return pkg;
  }

  async list(tenantId: string) {
    return this.prisma.auditPackage.findMany({ where: { tenant_id: tenantId }, orderBy: { created_at: 'desc' } });
  }
}
