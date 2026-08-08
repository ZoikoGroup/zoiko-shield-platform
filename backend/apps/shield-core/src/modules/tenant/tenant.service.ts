import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant, TenantStatus } from './tenant.entity';
import { IdentityEventService } from '../identity-adapter/identity-event.service';

// §7.2 Tenant lifecycle transitions. Tenants are created directly into
// PROVISIONING by the onboarding transaction and activated in the same
// transaction — this map governs every transition after that.
const ALLOWED_TRANSITIONS: Record<TenantStatus, TenantStatus[]> = {
  PROVISIONING: ['ACTIVE'],
  ACTIVE: ['RESTRICTED', 'SUSPENDED', 'OFFBOARDING'],
  RESTRICTED: ['ACTIVE', 'SUSPENDED'],
  SUSPENDED: ['ACTIVE', 'OFFBOARDING'],
  OFFBOARDING: ['CLOSED'],
  CLOSED: [],
};

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly eventService: IdentityEventService,
  ) {}

  findAll(): Promise<Tenant[]> {
    return this.tenantRepository.find();
  }

  async findOne(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} not found`);
    }
    return tenant;
  }

  async transitionStatus(id: string, targetStatus: TenantStatus, actorPrincipalId: string): Promise<Tenant> {
    const tenant = await this.findOne(id);
    const allowed = ALLOWED_TRANSITIONS[tenant.status] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw new ConflictException(`Illegal tenant transition from '${tenant.status}' to '${targetStatus}'`);
    }

    const previousStatus = tenant.status;
    tenant.status = targetStatus;
    await this.tenantRepository.save(tenant);

    await this.eventService.record({
      eventType: 'tenant_status_changed',
      tenantId: tenant.id,
      actorId: actorPrincipalId,
      data: { previousStatus, newStatus: targetStatus },
    });

    return tenant;
  }
}
