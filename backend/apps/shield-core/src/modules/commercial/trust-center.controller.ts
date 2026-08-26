import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { requireTenantId } from '../../tenant-context';
import {
  PublishTrustCenterArtifactDto,
  TrustCenterService,
} from './trust-center.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/commercial/trust-center')
export class TrustCenterController {
  constructor(private readonly trustCenterService: TrustCenterService) {}

  /**
   * GET /api/v1/commercial/trust-center/overview
   * Security posture, published audit artifacts, and approved claims summary.
   */
  @Get('overview')
  async getOverview(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const data = await this.trustCenterService.getTrustCenterOverview(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  /**
   * GET /api/v1/commercial/trust-center/procurement
   * Procurement workspace: vendor details, DPAs, tax facts, contacts.
   */
  @Get('procurement')
  async getProcurementWorkspace(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const data = await this.trustCenterService.getProcurementWorkspace(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  /**
   * POST /api/v1/commercial/trust-center/publish
   * Publish a security artifact or compliance disclosure.
   */
  @Post('publish')
  async publishArtifact(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: PublishTrustCenterArtifactDto,
    @Headers('x-actor-id') actorId = 'system-admin',
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const data = await this.trustCenterService.publishArtifact(
      tenantId,
      dto,
      actorId,
    );
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Trust Center artifact published successfully',
      data,
    };
  }
}
