import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ModelRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    provider: string;
    model: string;
    region: string;
    approvedDataClasses: string[];
    trainingAllowed?: boolean;
  }) {
    return this.prisma.modelProfile.create({
      data: {
        provider: data.provider,
        model: data.model,
        region: data.region,
        approved_data_classes: JSON.stringify(data.approvedDataClasses),
        training_allowed: data.trainingAllowed ?? false,
        status: 'ACTIVE',
      },
    });
  }

  async getById(id: string) {
    const profile = await this.prisma.modelProfile.findUnique({
      where: { id },
    });
    if (!profile) {
      throw new NotFoundException(`ModelProfile '${id}' not found`);
    }
    return profile;
  }

  /** First ACTIVE profile matching provider/region — no silent fallback to an unapproved region (spec correction #4). */
  async findEligible(params: { region: string; allowedProfileIds?: string[] }) {
    return this.prisma.modelProfile.findFirst({
      where: {
        status: 'ACTIVE',
        region: params.region,
        ...(params.allowedProfileIds
          ? { id: { in: params.allowedProfileIds } }
          : {}),
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async setStatus(id: string, status: 'ACTIVE' | 'DISABLED') {
    return this.prisma.modelProfile.update({ where: { id }, data: { status } });
  }
}
