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
  CreateZoikoOneBundleOrderDto,
  ZoikoOneBundlingService,
} from './zoiko-one-bundling.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/commercial/zoiko-one')
export class ZoikoOneBundlingController {
  constructor(
    private readonly zoikoOneBundlingService: ZoikoOneBundlingService,
  ) {}

  /**
   * POST /api/v1/commercial/zoiko-one/bundle-orders
   * Create a dedicated Zoiko One bundle order reference.
   */
  @Post('bundle-orders')
  async createBundleOrder(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: CreateZoikoOneBundleOrderDto,
    @Headers('x-actor-id') actorId = 'system-admin',
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const data = await this.zoikoOneBundlingService.createBundleOrder(
      tenantId,
      dto,
      actorId,
    );
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Zoiko One bundle order registered successfully',
      data,
    };
  }

  /**
   * GET /api/v1/commercial/zoiko-one/scope-view
   * Included vs Incremental scope view for tenant.
   */
  @Get('scope-view')
  async getScopeView(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const data = await this.zoikoOneBundlingService.getScopeView(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  /**
   * POST /api/v1/commercial/zoiko-one/reconcile-overlap
   * Reconcile potential double-charge/entitlement overlaps between direct and bundle contracts.
   */
  @Post('reconcile-overlap')
  async reconcileOverlap(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body('commercialAccountId') commercialAccountId: string,
    @Headers('x-actor-id') actorId = 'system-admin',
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const data = await this.zoikoOneBundlingService.reconcileOverlap(
      tenantId,
      commercialAccountId,
      actorId,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Zoiko One overlap reconciliation completed',
      data,
    };
  }
}
