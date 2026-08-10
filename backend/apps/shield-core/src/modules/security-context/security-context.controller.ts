import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Headers,
  Body,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { AssetService } from './assets/asset.service';
import { IdentityEntityService } from './identities/identity-entity.service';
import { AssetResolutionService } from './assets/asset-resolution.service';
import { IdentityResolutionService } from './identities/identity-resolution.service';
import { PrismaService } from '../../prisma/prisma.service';

export class ResolveAssetRequestDto {
  externalId!: string;
  assetType!: string;
  sourceSystem?: string;
  externalType?: string;
  hostname?: string;
  criticality?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export class ResolveIdentityRequestDto {
  externalId?: string;
  email?: string;
  displayName?: string;
  sourceSystem?: string;
  externalType?: string;
  identityType?: 'HUMAN' | 'SERVICE_ACCOUNT' | 'WORKLOAD' | 'APPLICATION' | 'MANAGED_IDENTITY';
}

@Controller('api/v1/context')
export class SecurityContextController {
  constructor(
    private readonly assetService: AssetService,
    private readonly identityService: IdentityEntityService,
    private readonly assetResolution: AssetResolutionService,
    private readonly identityResolution: IdentityResolutionService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('assets')
  async getAssets(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
    @Query('limit') limit?: number,
  ) {
    const tenantId = headerTenantId || queryTenantId || 'default-tenant';
    const assets = await this.assetService.getAssets(tenantId, limit ? Number(limit) : 50);
    return { statusCode: HttpStatus.OK, data: assets };
  }

  @Get('assets/:assetId')
  async getAssetById(@Param('assetId') assetId: string) {
    const asset = await this.assetService.getAssetById(assetId);
    return { statusCode: HttpStatus.OK, data: asset };
  }

  @Get('identities')
  async getIdentities(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
    @Query('limit') limit?: number,
  ) {
    const tenantId = headerTenantId || queryTenantId || 'default-tenant';
    const identities = await this.identityService.getIdentities(tenantId, limit ? Number(limit) : 50);
    return { statusCode: HttpStatus.OK, data: identities };
  }

  @Get('identities/:identityId')
  async getIdentityById(@Param('identityId') identityId: string) {
    const identity = await this.identityService.getIdentityById(identityId);
    return { statusCode: HttpStatus.OK, data: identity };
  }

  @Get('snapshots/:snapshotId')
  async getSnapshotById(@Param('snapshotId') snapshotId: string) {
    const snapshot = await this.prisma.contextSnapshot.findUnique({ where: { id: snapshotId } });
    if (!snapshot) {
      throw new NotFoundException(`Context snapshot '${snapshotId}' not found`);
    }
    return { statusCode: HttpStatus.OK, data: snapshot };
  }

  @Post('assets/resolve')
  async resolveAsset(@Headers('x-tenant-id') headerTenantId: string, @Body() dto: ResolveAssetRequestDto) {
    const tenantId = headerTenantId || 'default-tenant';
    const resolved = await this.assetResolution.resolve({
      tenantId,
      sourceSystem: dto.sourceSystem || 'MANUAL',
      externalType: dto.externalType || 'EXTERNAL_ID',
      externalId: dto.externalId,
      assetType: dto.assetType,
      hostname: dto.hostname,
      criticality: dto.criticality,
    });
    return { statusCode: HttpStatus.OK, data: resolved };
  }

  @Post('identities/resolve')
  async resolveIdentity(@Headers('x-tenant-id') headerTenantId: string, @Body() dto: ResolveIdentityRequestDto) {
    const tenantId = headerTenantId || 'default-tenant';
    const resolved = await this.identityResolution.resolve({
      tenantId,
      sourceSystem: dto.sourceSystem || 'MANUAL',
      externalType: dto.externalType || (dto.externalId ? 'EXTERNAL_ID' : 'EMAIL'),
      externalId: dto.externalId || dto.email!,
      email: dto.email,
      displayName: dto.displayName,
      identityType: dto.identityType,
    });
    return { statusCode: HttpStatus.OK, data: resolved };
  }
}
