import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AiUseCaseRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { key: string; name: string; allowedDataClasses: string[]; allowedTools: string[]; prohibitedActions?: string[]; humanReviewRequired?: boolean }) {
    return this.prisma.aiUseCase.create({
      data: {
        key: data.key,
        name: data.name,
        allowed_data_classes: JSON.stringify(data.allowedDataClasses),
        allowed_tools: JSON.stringify(data.allowedTools),
        prohibited_actions: JSON.stringify(data.prohibitedActions ?? []),
        human_review_required: data.humanReviewRequired ?? true,
        status: 'ACTIVE',
      },
    });
  }

  async getByKey(key: string) {
    const useCase = await this.prisma.aiUseCase.findUnique({ where: { key } });
    if (!useCase) {
      throw new NotFoundException(`AiUseCase '${key}' not found`);
    }
    return useCase;
  }

  async setStatus(key: string, status: 'ACTIVE' | 'DISABLED') {
    return this.prisma.aiUseCase.update({ where: { key }, data: { status } });
  }
}
