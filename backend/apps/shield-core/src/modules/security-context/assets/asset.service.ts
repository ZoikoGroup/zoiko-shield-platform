import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AssetService {
  constructor(private readonly prisma: PrismaService) {}

  async getAssets(tenantId: string, limit = 50) {
    return this.prisma.asset.findMany({
      where: { tenant_id: tenantId },
      take: limit,
      orderBy: { last_seen_at: 'desc' },
      include: { aliases: true },
    });
  }

  async getAssetById(assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        aliases: true,
        normalizedEvents: { take: 10, orderBy: { recorded_at: 'desc' } },
      },
    });
    if (!asset) {
      throw new NotFoundException(`Asset '${assetId}' not found`);
    }
    return asset;
  }
}
