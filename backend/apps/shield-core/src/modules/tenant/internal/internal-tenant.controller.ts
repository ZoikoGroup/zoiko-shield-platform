import {
  Controller,
  Get,
  Param,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../tenant.entity';
import { InternalAuthGuard } from '../../../internal-client/internal-auth.guard';

export interface TenantResidencyContext {
  tenantId: string;
  homeRegion: string;
  dataResidencyRegion: string;
  status: string;
}

/**
 * shield-ingest's ONLY window into the tenant record. Residency is decided
 * once at onboarding and lives in shield-core's TypeORM `tenant.tenants`
 * table, which has no Prisma model — a satellite cannot read it locally and
 * must not infer it from a client-supplied request field.
 */
@Controller('internal/v1/tenants')
@UseGuards(InternalAuthGuard)
export class InternalTenantController {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  @Get(':tenantId/residency')
  async getResidency(
    @Param('tenantId') tenantId: string,
  ): Promise<{ data: TenantResidencyContext }> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      select: {
        id: true,
        homeRegion: true,
        dataResidencyRegion: true,
        status: true,
      },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant '${tenantId}' not found`);
    }

    return {
      data: {
        tenantId: tenant.id,
        homeRegion: tenant.homeRegion,
        dataResidencyRegion: tenant.dataResidencyRegion,
        status: tenant.status,
      },
    };
  }
}
