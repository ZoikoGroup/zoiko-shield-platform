import { Injectable, NotFoundException } from '@nestjs/common';
import { Organization } from './organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import * as crypto from 'crypto';

@Injectable()
export class OrganizationService {
  private organizations: Organization[] = [];

  findAll(): Organization[] {
    return this.organizations;
  }

  findOne(id: string): Organization {
    const item = this.organizations.find((c) => c.id === id);
    if (!item) throw new NotFoundException(`Organization with ID ${id} not found`);
    return item;
  }

  create(createDto: CreateOrganizationDto): Organization {
    const newItem: Organization = {
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
        purpose: 'organization-creation',
        dataClass: 'restricted',
        policyVersion: '1.0',
        contractId: 'organization-api',
        contractVersion: '1.0',
        recordedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.organizations.push(newItem);
    return newItem;
  }

  update(id: string, updateDto: UpdateOrganizationDto): Organization {
    const item = this.findOne(id);
    const updated = { ...item, ...updateDto, updatedAt: new Date().toISOString() };
    this.organizations = this.organizations.map((c) => (c.id === id ? updated : c));
    return updated;
  }

  remove(id: string): void {
    this.findOne(id);
    this.organizations = this.organizations.filter((c) => c.id !== id);
  }
}