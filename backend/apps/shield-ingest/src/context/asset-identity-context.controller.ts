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
import { requireTenantId } from '../security/tenant-context';

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
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
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
  async getAssetById(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('assetId') assetId: string,
  ) {
    const asset = await this.contextService.getAssetById(requireTenantId(headerTenantId), assetId);
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
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
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
  async getIdentityById(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('identityId') identityId: string,
  ) {
    const identity = await this.contextService.getIdentityById(
      requireTenantId(headerTenantId),
      identityId,
    );
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
    const tenantId = requireTenantId(headerTenantId);
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
    const tenantId = requireTenantId(headerTenantId);
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
