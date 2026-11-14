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
  UseGuards,
} from '@nestjs/common';
import { AssetService } from './assets/asset.service';
import { IdentityEntityService } from './identities/identity-entity.service';
import { AssetResolutionService } from './assets/asset-resolution.service';
import { IdentityResolutionService } from './identities/identity-resolution.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { requireEnvironmentId, requireTenantId } from '../../tenant-context';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { BadRequestException } from '@nestjs/common';

const MANUAL_SOURCE_ACCOUNT = 'manual';

// The global ValidationPipe runs with whitelist: true, which strips every
// property that carries no class-validator decorator. Without these the
// handlers received an empty body.
export class ResolveAssetRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  sourceAccountId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  externalId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  assetType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceSystem?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  externalType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  hostname?: string;

  @IsOptional()
  @IsIn(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
  criticality?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export class ResolveIdentityRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  sourceAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  externalId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceSystem?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  externalType?: string;

  @IsOptional()
  @IsIn([
    'HUMAN',
    'SERVICE_ACCOUNT',
    'WORKLOAD',
    'APPLICATION',
    'MANAGED_IDENTITY',
  ])
  identityType?:
    | 'HUMAN'
    | 'SERVICE_ACCOUNT'
    | 'WORKLOAD'
    | 'APPLICATION'
    | 'MANAGED_IDENTITY';
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
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
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const assets = await this.assetService.getAssets(
      tenantId,
      limit ? Number(limit) : 50,
    );
    return { statusCode: HttpStatus.OK, data: assets };
  }

  @Get('assets/resolution-decisions')
  async getAssetResolutionDecisions(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
    @Query('limit') limit?: number,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const take = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const decisions = await this.prisma.resolutionDecision.findMany({
      where: { tenant_id: tenantId, entity_type: 'ASSET' },
      take,
      orderBy: { created_at: 'desc' },
    });
    return { statusCode: HttpStatus.OK, data: decisions };
  }

  @Get('assets/:assetId')
  async getAssetById(
    @Headers('x-tenant-id') tenantId: string,
    @Param('assetId') assetId: string,
  ) {
    const asset = await this.assetService.getAssetById(tenantId, assetId);
    return { statusCode: HttpStatus.OK, data: asset };
  }

  @Get('identities')
  async getIdentities(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
    @Query('limit') limit?: number,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const identities = await this.identityService.getIdentities(
      tenantId,
      limit ? Number(limit) : 50,
    );
    return { statusCode: HttpStatus.OK, data: identities };
  }

  @Get('identities/:identityId')
  async getIdentityById(
    @Headers('x-tenant-id') tenantId: string,
    @Param('identityId') identityId: string,
  ) {
    const identity = await this.identityService.getIdentityById(
      tenantId,
      identityId,
    );
    return { statusCode: HttpStatus.OK, data: identity };
  }

  @Get('snapshots/:snapshotId')
  async getSnapshotById(
    @Headers('x-tenant-id') tenantId: string,
    @Param('snapshotId') snapshotId: string,
  ) {
    const snapshot = await this.prisma.contextSnapshot.findFirst({
      where: { id: snapshotId, tenant_id: tenantId },
    });
    if (!snapshot) {
      throw new NotFoundException(`Context snapshot '${snapshotId}' not found`);
    }
    return { statusCode: HttpStatus.OK, data: snapshot };
  }

  @Post('assets/resolve')
  async resolveAsset(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: ResolveAssetRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const resolved = await this.assetResolution.resolve({
      tenantId,
      environmentId: requireEnvironmentId(user.environmentId),
      sourceSystem: dto.sourceSystem || 'MANUAL',
      // Part of the alias key; a compound unique lookup cannot match on null.
      // Connector-fed assets carry their connector id; manual entries share one.
      sourceAccountId: dto.sourceAccountId || MANUAL_SOURCE_ACCOUNT,
      externalType: dto.externalType || 'EXTERNAL_ID',
      externalId: dto.externalId,
      assetType: dto.assetType,
      hostname: dto.hostname,
      criticality: dto.criticality,
    });
    return { statusCode: HttpStatus.OK, data: resolved };
  }

  @Post('identities/resolve')
  async resolveIdentity(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: ResolveIdentityRequestDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    if (!dto.externalId && !dto.email) {
      throw new BadRequestException('Either externalId or email is required');
    }
    const resolved = await this.identityResolution.resolve({
      tenantId,
      sourceSystem: dto.sourceSystem || 'MANUAL',
      sourceAccountId: dto.sourceAccountId || MANUAL_SOURCE_ACCOUNT,
      externalType:
        dto.externalType || (dto.externalId ? 'EXTERNAL_ID' : 'EMAIL'),
      externalId: dto.externalId || dto.email!,
      email: dto.email,
      displayName: dto.displayName,
      identityType: dto.identityType,
    });
    return { statusCode: HttpStatus.OK, data: resolved };
  }
}
