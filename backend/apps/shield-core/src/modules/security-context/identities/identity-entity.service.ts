import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class IdentityEntityService {
  constructor(private readonly prisma: PrismaService) {}

  async getIdentities(tenantId: string, limit = 50) {
    return this.prisma.identityEntity.findMany({
      where: { tenant_id: tenantId },
      take: limit,
      orderBy: { last_seen_at: 'desc' },
      include: { aliases: true },
    });
  }

  async getIdentityById(identityId: string) {
    const identity = await this.prisma.identityEntity.findUnique({
      where: { id: identityId },
      include: {
        aliases: true,
        normalizedEvents: { take: 10, orderBy: { recorded_at: 'desc' } },
      },
    });
    if (!identity) {
      throw new NotFoundException(`Identity entity '${identityId}' not found`);
    }
    return identity;
  }
}
