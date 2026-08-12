import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
  ) {}

  findAllForTenant(tenantId: string): Promise<Organization[]> {
    return this.organizationRepository.find({ where: { tenantId } });
  }

  async findOne(tenantId: string, id: string): Promise<Organization> {
    const item = await this.organizationRepository.findOne({ where: { id, tenantId } });
    if (!item) {
      throw new NotFoundException(`Organization ${id} not found for tenant ${tenantId}`);
    }
    return item;
  }

  create(tenantId: string, dto: CreateOrganizationDto): Promise<Organization> {
    return this.organizationRepository.save(this.organizationRepository.create({ tenantId, ...dto }));
  }

  async update(tenantId: string, id: string, dto: UpdateOrganizationDto): Promise<Organization> {
    const item = await this.findOne(tenantId, id);
    Object.assign(item, dto);
    return this.organizationRepository.save(item);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const item = await this.findOne(tenantId, id);
    await this.organizationRepository.remove(item);
  }
}
