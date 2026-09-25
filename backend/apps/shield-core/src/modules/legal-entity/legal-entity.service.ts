import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { LegalEntity } from './legal-entity.entity';
import { CreateLegalEntityDto } from './dto/create-legal-entity.dto';
import { UpdateLegalEntityDto } from './dto/update-legal-entity.dto';

@Injectable()
export class LegalEntityService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForTenant(tenantId: string): Promise<LegalEntity[]> {
    return this.prisma.legalEntity.findMany({ where: { tenantId } });
  }

  async findOne(tenantId: string, id: string): Promise<LegalEntity> {
    const item = await this.prisma.legalEntity.findFirst({
      where: { id, tenantId },
    });
    if (!item) {
      throw new NotFoundException(
        `Legal entity ${id} not found for tenant ${tenantId}`,
      );
    }
    return item;
  }

  create(tenantId: string, dto: CreateLegalEntityDto): Promise<LegalEntity> {
    return this.prisma.legalEntity.create({
      data: {
        tenantId,
        legalName: dto.legalName,
        registrationNumber: dto.registrationNumber,
        countryOfRegistration: dto.countryOfRegistration,
        registeredAddress: dto.registeredAddress,
      },
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateLegalEntityDto,
  ): Promise<LegalEntity> {
    const item = await this.findOne(tenantId, id);
    return this.prisma.legalEntity.update({
      where: { id: item.id },
      data: {
        legalName: dto.legalName,
        registrationNumber: dto.registrationNumber,
        countryOfRegistration: dto.countryOfRegistration,
        registeredAddress: dto.registeredAddress,
      },
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const item = await this.findOne(tenantId, id);
    await this.prisma.legalEntity.deleteMany({
      where: { id: item.id, tenantId },
    });
  }
}
