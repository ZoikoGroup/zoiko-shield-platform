import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LegalEntity } from './legal-entity.entity';
import { CreateLegalEntityDto } from './dto/create-legal-entity.dto';
import { UpdateLegalEntityDto } from './dto/update-legal-entity.dto';

@Injectable()
export class LegalEntityService {
  constructor(
    @InjectRepository(LegalEntity)
    private readonly legalEntityRepository: Repository<LegalEntity>,
  ) {}

  findAllForTenant(tenantId: string): Promise<LegalEntity[]> {
    return this.legalEntityRepository.find({ where: { tenantId } });
  }

  async findOne(tenantId: string, id: string): Promise<LegalEntity> {
    const item = await this.legalEntityRepository.findOne({
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
    return this.legalEntityRepository.save(
      this.legalEntityRepository.create({ tenantId, ...dto }),
    );
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateLegalEntityDto,
  ): Promise<LegalEntity> {
    const item = await this.findOne(tenantId, id);
    Object.assign(item, dto);
    return this.legalEntityRepository.save(item);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const item = await this.findOne(tenantId, id);
    await this.legalEntityRepository.remove(item);
  }
}
