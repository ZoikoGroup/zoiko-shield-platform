import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class CaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByTenantAndId(tenantId: string, caseId: string) {
    return this.prisma.case.findFirst({
      where: { id: caseId, tenant_id: tenantId },
    });
  }

  /** Reads Alert directly — same shared Prisma schema as shield-ingest, no Kafka round-trip needed for this synchronous read. */
  findAlertByTenantAndId(tenantId: string, alertId: string) {
    return this.prisma.alert.findFirst({
      where: { id: alertId, tenant_id: tenantId },
    });
  }
}
