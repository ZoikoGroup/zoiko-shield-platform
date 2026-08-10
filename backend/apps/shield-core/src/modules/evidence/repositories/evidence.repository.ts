import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class EvidenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(evidenceId: string) {
    return this.prisma.evidenceRecord.findUnique({ where: { id: evidenceId } });
  }

  findByTenantAndId(tenantId: string, evidenceId: string) {
    return this.prisma.evidenceRecord.findFirst({ where: { id: evidenceId, tenant_id: tenantId } });
  }
}
