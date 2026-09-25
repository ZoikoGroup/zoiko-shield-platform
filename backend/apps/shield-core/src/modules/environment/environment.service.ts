import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Environment } from './environment.entity';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { UpdateEnvironmentDto } from './dto/update-environment.dto';

@Injectable()
export class EnvironmentService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForTenant(tenantId: string): Promise<Environment[]> {
    return (await this.prisma.environment.findMany({
      where: { tenantId },
    })) as Environment[];
  }

  async findOne(tenantId: string, id: string): Promise<Environment> {
    const item = await this.prisma.environment.findFirst({
      where: { id, tenantId },
    });
    if (!item) {
      throw new NotFoundException(
        `Environment ${id} not found for tenant ${tenantId}`,
      );
    }
    return item as Environment;
  }

  async create(
    tenantId: string,
    dto: CreateEnvironmentDto,
    defaultRegion: string,
  ): Promise<Environment> {
    return (await this.prisma.environment.create({
      data: {
        tenantId,
        name: dto.name,
        environmentType: dto.environmentType,
        region: dto.region ?? defaultRegion,
      },
    })) as Environment;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateEnvironmentDto,
  ): Promise<Environment> {
    const item = await this.findOne(tenantId, id);
    return (await this.prisma.environment.update({
      where: { id: item.id },
      data: { name: dto.name, status: dto.status },
    })) as Environment;
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const item = await this.findOne(tenantId, id);
    await this.prisma.environment.deleteMany({
      where: { id: item.id, tenantId },
    });
  }
}
