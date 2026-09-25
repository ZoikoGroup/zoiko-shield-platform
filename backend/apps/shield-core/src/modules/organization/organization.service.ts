import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Organization } from './organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForTenant(tenantId: string): Promise<Organization[]> {
    return (await this.prisma.organization.findMany({
      where: { tenantId },
    })) as Organization[];
  }

  async findOne(tenantId: string, id: string): Promise<Organization> {
    const item = await this.prisma.organization.findFirst({
      where: { id, tenantId },
    });
    if (!item) {
      throw new NotFoundException(
        `Organization ${id} not found for tenant ${tenantId}`,
      );
    }
    return item as Organization;
  }

  async create(
    tenantId: string,
    dto: CreateOrganizationDto,
  ): Promise<Organization> {
    return (await this.prisma.organization.create({
      data: { tenantId, name: dto.name },
    })) as Organization;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateOrganizationDto,
  ): Promise<Organization> {
    const item = await this.findOne(tenantId, id);
    return (await this.prisma.organization.update({
      where: { id: item.id },
      data: { name: dto.name, status: dto.status },
    })) as Organization;
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const item = await this.findOne(tenantId, id);
    await this.prisma.organization.deleteMany({
      where: { id: item.id, tenantId },
    });
  }
}
