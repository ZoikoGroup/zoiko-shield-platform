import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Environment } from './environment.entity';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { UpdateEnvironmentDto } from './dto/update-environment.dto';

@Injectable()
export class EnvironmentService {
  constructor(
    @InjectRepository(Environment)
    private readonly environmentRepository: Repository<Environment>,
  ) {}

  findAllForTenant(tenantId: string): Promise<Environment[]> {
    return this.environmentRepository.find({ where: { tenantId } });
  }

  async findOne(tenantId: string, id: string): Promise<Environment> {
    const item = await this.environmentRepository.findOne({ where: { id, tenantId } });
    if (!item) {
      throw new NotFoundException(`Environment ${id} not found for tenant ${tenantId}`);
    }
    return item;
  }

  create(tenantId: string, dto: CreateEnvironmentDto, defaultRegion: string): Promise<Environment> {
    return this.environmentRepository.save(
      this.environmentRepository.create({
        tenantId,
        name: dto.name,
        environmentType: dto.environmentType,
        region: dto.region ?? defaultRegion,
      }),
    );
  }

  async update(tenantId: string, id: string, dto: UpdateEnvironmentDto): Promise<Environment> {
    const item = await this.findOne(tenantId, id);
    Object.assign(item, dto);
    return this.environmentRepository.save(item);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const item = await this.findOne(tenantId, id);
    await this.environmentRepository.remove(item);
  }
}
