import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Headers,
  Body,
  HttpStatus,
} from '@nestjs/common';
import { AssetIdentityContextService } from './asset-identity-context.service';

export class ResolveAssetRequestDto {
  externalId!: string;
  assetType!: string;
  name?: string;
  criticality?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export class ResolveIdentityRequestDto {
  externalId?: string;
  email?: string;
  displayName?: string;
  identityType?: 'USER' | 'SERVICE_ACCOUNT' | 'SYSTEM_ROLE';
}

@Controller('api/v1/context')
export class AssetIdentityContextController {
  constructor(private readonly contextService: AssetIdentityContextService) {}

  /**
   * GET /api/v1/context/assets
   * Query assets for tenant
   */
  @Get('assets')
  async getAssets(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
    @Query('limit') limit?: number,
  ) {
    const tenantId = headerTenantId || queryTenantId || 'default-tenant';
    const assets = await this.contextService.getAssets(
      tenantId,
      limit ? Number(limit) : 50,
    );
    return {
      statusCode: HttpStatus.OK,
      data: assets,
    };
  }

  /**
   * GET /api/v1/context/assets/:assetId
   * Get single asset details
   */
  @Get('assets/:assetId')
  async getAssetById(@Param('assetId') assetId: string) {
    const asset = await this.contextService.getAssetById(assetId);
    return {
      statusCode: HttpStatus.OK,
      data: asset,
    };
  }

  /**
   * GET /api/v1/context/identities
   * Query identity entities for tenant
   */
  @Get('identities')
  async getIdentities(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
    @Query('limit') limit?: number,
  ) {
    const tenantId = headerTenantId || queryTenantId || 'default-tenant';
    const identities = await this.contextService.getIdentities(
      tenantId,
      limit ? Number(limit) : 50,
    );
    return {
      statusCode: HttpStatus.OK,
      data: identities,
    };
  }

  /**
   * GET /api/v1/context/identities/:identityId
   * Get single identity detail
   */
  @Get('identities/:identityId')
  async getIdentityById(@Param('identityId') identityId: string) {
    const identity = await this.contextService.getIdentityById(identityId);
    return {
      statusCode: HttpStatus.OK,
      data: identity,
    };
  }

  /**
   * POST /api/v1/context/assets/resolve
   * Resolve or create tenant asset manually
   */
  @Post('assets/resolve')
  async resolveAsset(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: ResolveAssetRequestDto,
  ) {
    const tenantId = headerTenantId || 'default-tenant';
    const asset = await this.contextService.resolveAsset({
      tenantId,
      ...dto,
    });
    return {
      statusCode: HttpStatus.OK,
      data: asset,
    };
  }

  /**
   * POST /api/v1/context/identities/resolve
   * Resolve or create tenant identity manually
   */
  @Post('identities/resolve')
  async resolveIdentity(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: ResolveIdentityRequestDto,
  ) {
    const tenantId = headerTenantId || 'default-tenant';
    const identity = await this.contextService.resolveIdentity({
      tenantId,
      ...dto,
    });
    return {
      statusCode: HttpStatus.OK,
      data: identity,
    };
  }
}
