import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant } from './tenant.entity';
import { CanonicalContext } from './interfaces/canonical-context.interface';

// Placeholder values for context fields this in-memory module cannot yet
// resolve for real (legal entity / environment / policy modules aren't
// wired up). Every identity, tracing and policy-version field is still
// server-generated per request — never accepted from the client — even
// though the domain values below are provisional. Tenant status starts
// PROVISIONING-equivalent ("active" here, since this module predates the
// full lifecycle state machine); revisit once legal-entity/environment
// creation is a real flow.
const PROVISIONAL_REGION = 'unassigned';
const PROVISIONAL_POLICY_VERSION = 'unassigned';
const PROVISIONAL_DATA_CLASS = 'unclassified';

function buildServerContext(tenantId: string): CanonicalContext {
  const now = new Date().toISOString();
  return {
    tenantId,
    legalEntityId: 'pending',
    environmentId: 'pending',
    region: PROVISIONAL_REGION,
    correlationId: randomUUID(),
    traceId: randomUUID(),
    requestId: randomUUID(),
    purpose: 'tenant-provisioning',
    dataClass: PROVISIONAL_DATA_CLASS,
    policyVersion: PROVISIONAL_POLICY_VERSION,
    contractId: 'pending',
    contractVersion: 'pending',
    recordedAt: now,
  };
}

@Injectable()
export class TenantService {
  private tenants: Tenant[] = []; // In-memory mock for now

  create(createTenantDto: CreateTenantDto): Tenant {
    const id = randomUUID();
    const tenant: Tenant = {
      id,
      name: createTenantDto.name,
      status: 'active',
      context: buildServerContext(id),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.tenants.push(tenant);
    return tenant;
  }

  findAll(): Tenant[] {
    return this.tenants;
  }

  findOne(id: string): Tenant {
    const tenant = this.tenants.find(t => t.id === id);
    if (!tenant) {
      throw new Error(`Tenant with id ${id} not found`);
    }
    return tenant;
  }

  update(id: string, updateTenantDto: UpdateTenantDto): Tenant {
    const index = this.tenants.findIndex(t => t.id === id);
    if (index >= 0) {
      this.tenants[index] = {
        ...this.tenants[index],
        ...updateTenantDto,
        context: buildServerContext(id),
        updatedAt: new Date().toISOString(),
      };
      return this.tenants[index];
    }
    throw new Error(`Tenant with id ${id} not found`);
  }

  remove(id: string): boolean {
    const initialLength = this.tenants.length;
    this.tenants = this.tenants.filter(t => t.id !== id);
    return this.tenants.length < initialLength;
  }
}
