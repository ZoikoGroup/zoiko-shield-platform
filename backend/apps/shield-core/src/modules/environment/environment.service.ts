import { Injectable, NotFoundException } from '@nestjs/common';
import { Environment } from './environment.entity';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { UpdateEnvironmentDto } from './dto/update-environment.dto';
import * as crypto from 'crypto';

@Injectable()
export class EnvironmentService {
  private environments: Environment[] = [];

  findAll(): Environment[] {
    return this.environments;
  }

  findOne(id: string): Environment {
    const item = this.environments.find((c) => c.id === id);
    if (!item) throw new NotFoundException(`Environment with ID ${id} not found`);
    return item;
  }

  create(createDto: CreateEnvironmentDto): Environment {
    const newItem: Environment = {
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
        purpose: 'environment-creation',
        dataClass: 'restricted',
        policyVersion: '1.0',
        contractId: 'environment-api',
        contractVersion: '1.0',
        recordedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.environments.push(newItem);
    return newItem;
  }

  update(id: string, updateDto: UpdateEnvironmentDto): Environment {
    const item = this.findOne(id);
    const updated = { ...item, ...updateDto, updatedAt: new Date().toISOString() };
    this.environments = this.environments.map((c) => (c.id === id ? updated : c));
    return updated;
  }

  remove(id: string): void {
    this.findOne(id);
    this.environments = this.environments.filter((c) => c.id !== id);
  }
}