import {
  Controller,
  Get,
  Param,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { InternalAuthGuard } from '../../../internal-client/internal-auth.guard';

export interface TenantResidencyContext {
  tenantId: string;
  homeRegion: string;
  dataResidencyRegion: string;
  status: string;
}

/**
 * shield-ingest's ONLY window into the tenant record. Residency is decided
 * once at onboarding and lives in shield-core's `tenant.tenants` table, which
 * shield-core owns — a satellite cannot read it locally and must not infer it
 * from a client-supplied request field.
 */
@Controller('internal/v1/tenants')
@UseGuards(InternalAuthGuard)
export class InternalTenantController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':tenantId/residency')
  async getResidency(
    @Param('tenantId') tenantId: string,
  ): Promise<{ data: TenantResidencyContext }> {
    const tenant = await this.prisma.tenant.findUnique({
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
