import { Injectable, NotFoundException } from '@nestjs/common';
import { LegalEntity } from './legal-entity.entity';
import { CreateLegalEntityDto } from './dto/create-legal-entity.dto';
import { UpdateLegalEntityDto } from './dto/update-legal-entity.dto';
import * as crypto from 'crypto';

@Injectable()
export class LegalEntityService {
  private legalEntitys: LegalEntity[] = [];

  findAll(): LegalEntity[] {
    return this.legalEntitys;
  }

  findOne(id: string): LegalEntity {
    const item = this.legalEntitys.find((c) => c.id === id);
    if (!item) throw new NotFoundException(`LegalEntity with ID ${id} not found`);
    return item;
  }

  create(createDto: CreateLegalEntityDto): LegalEntity {
    const newItem: LegalEntity = {
      id: crypto.randomUUID(),
      name: createDto.name,
      status: 'ACTIVE',
      context: {
        tenantId: 'default-tenant',
        legalEntityId: 'default-entity',
        environmentId: 'dev',
        region: 'us-east-1',
        correlationId: crypto.randomUUID(),
        traceId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        purpose: 'legal-entity-creation',
        dataClass: 'restricted',
        policyVersion: '1.0',
        contractId: 'legal-entity-api',
        contractVersion: '1.0',
        recordedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.legalEntitys.push(newItem);
    return newItem;
  }

  update(id: string, updateDto: UpdateLegalEntityDto): LegalEntity {
    const item = this.findOne(id);
    const updated = { ...item, ...updateDto, updatedAt: new Date().toISOString() };
    this.legalEntitys = this.legalEntitys.map((c) => (c.id === id ? updated : c));
    return updated;
  }

  remove(id: string): void {
    this.findOne(id);
    this.legalEntitys = this.legalEntitys.filter((c) => c.id !== id);
  }
}