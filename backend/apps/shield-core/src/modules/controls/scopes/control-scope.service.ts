import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CreateControlScopeInput {
  tenantId: string;
  controlImplementationId: string;
  legalEntityId?: string;
  environmentId?: string;
  businessUnitId?: string;
  assetScope?: string;
  identityScope?: string;
  expiresAt?: Date;
}

/** Coverage must be explicit — "control exists for tenant" never implies "control covers every asset" (spec §8). */
@Injectable()
export class ControlScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateControlScopeInput) {
    return this.prisma.controlScope.create({
      data: {
        id: randomUUID(),
        tenant_id: input.tenantId,
        control_implementation_id: input.controlImplementationId,
        legal_entity_id: input.legalEntityId,
        environment_id: input.environmentId,
        business_unit_id: input.businessUnitId,
        asset_scope: input.assetScope,
        identity_scope: input.identityScope,
        expires_at: input.expiresAt,
      },
    });
  }

  async listForImplementation(
    tenantId: string,
    controlImplementationId: string,
  ) {
    return this.prisma.controlScope.findMany({
      where: {
        tenant_id: tenantId,
        control_implementation_id: controlImplementationId,
      },
    });
  }
}
