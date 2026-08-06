import { Injectable } from '@nestjs/common';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant } from './tenant.entity';

@Injectable()
export class TenantService {
  private tenants: Tenant[] = []; // In-memory mock for now

  create(createTenantDto: CreateTenantDto): Tenant {
    const tenant: Tenant = {
      id: Date.now().toString(),
      name: createTenantDto.name,
      status: 'active',
      context: createTenantDto.context,
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

