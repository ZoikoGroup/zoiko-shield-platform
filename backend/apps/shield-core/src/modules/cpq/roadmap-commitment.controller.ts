import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDefined, ValidateNested } from 'class-validator';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { RequirePlatformPermissions } from '../authorization/decorators/require-platform-permissions.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { PlatformPermissionsGuard } from '../authorization/guards/platform-permissions.guard';
import { HumanAuthorityAttestationDto } from '../human-authority/human-authority.dto';
import { RequireHumanAuthority } from '../human-authority/human-authority.decorator';
import { HumanAuthorityGuard } from '../human-authority/human-authority.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { requireEnvironmentId, requireTenantId } from '../../tenant-context';
import {
  CreateRoadmapCommitmentDto,
  DecideRoadmapCommitmentDto,
  PassRoadmapReleaseGateDto,
  RoadmapCommitmentService,
  SubmitRoadmapCommitmentDto,
} from './roadmap-commitment.service';

class RoadmapDecisionRequest extends DecideRoadmapCommitmentDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => HumanAuthorityAttestationDto)
  humanAuthority!: HumanAuthorityAttestationDto;
}

class RoadmapReleaseGateRequest extends PassRoadmapReleaseGateDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => HumanAuthorityAttestationDto)
  humanAuthority!: HumanAuthorityAttestationDto;
}

function scope(
  headerTenantId: string,
  headerEnvironmentId: string,
  user: AuthenticatedUser,
) {
  return {
    tenantId: requireTenantId(headerTenantId, user.tenantId),
    environmentId: requireEnvironmentId(
      headerEnvironmentId,
      user.environmentId,
    ),
  };
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_READ)
@Controller('api/v1/cpq/quotes/:quoteId/roadmap-commitments')
export class TenantRoadmapCommitmentController {
  constructor(private readonly roadmap: RoadmapCommitmentService) {}

  @Post()
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  async create(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('quoteId') quoteId: string,
    @Body() dto: CreateRoadmapCommitmentDto,
  ) {
    const boundary = scope(headerTenantId, headerEnvironmentId, user);
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.roadmap.create(
        { ...boundary, actorId: user.id },
        quoteId,
        dto,
      ),
    };
  }

  @Get()
  async list(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('quoteId') quoteId: string,
  ) {
    const boundary = scope(headerTenantId, headerEnvironmentId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.roadmap.list(
        boundary.tenantId,
        boundary.environmentId,
        quoteId,
      ),
    };
  }

  @Patch(':commitmentId/submit')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async submit(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('quoteId') quoteId: string,
    @Param('commitmentId') commitmentId: string,
    @Body() dto: SubmitRoadmapCommitmentDto,
  ) {
    const boundary = scope(headerTenantId, headerEnvironmentId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.roadmap.submit(
        { ...boundary, actorId: user.id },
        quoteId,
        commitmentId,
        dto,
      ),
    };
  }
}

@UseGuards(JwtAuthGuard, PlatformPermissionsGuard, HumanAuthorityGuard)
@RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
@Controller('api/v1/platform/cpq/roadmap-commitments')
export class PlatformRoadmapCommitmentController {
  constructor(private readonly roadmap: RoadmapCommitmentService) {}

  @Patch(':id/legal-decision')
  @RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_ROADMAP_LEGAL_APPROVE)
  @RequireHumanAuthority(
    'LEGAL_COMPLIANCE_CONCLUSION',
    'RoadmapCommitment',
    'id',
  )
  async legalDecision(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RoadmapDecisionRequest,
  ) {
    const boundary = scope(headerTenantId, headerEnvironmentId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.roadmap.decide(
        boundary.tenantId,
        boundary.environmentId,
        id,
        'LEGAL',
        user.id,
        dto,
      ),
    };
  }

  @Patch(':id/product-decision')
  @RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_ROADMAP_PRODUCT_APPROVE)
  @RequireHumanAuthority(
    'COMMERCIAL_CHANGE_AUTHORIZATION',
    'RoadmapCommitment',
    'id',
  )
  async productDecision(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RoadmapDecisionRequest,
  ) {
    const boundary = scope(headerTenantId, headerEnvironmentId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.roadmap.decide(
        boundary.tenantId,
        boundary.environmentId,
        id,
        'PRODUCT',
        user.id,
        dto,
      ),
    };
  }

  @Patch(':id/release-gate')
  @RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_ROADMAP_PRODUCT_APPROVE)
  @RequireHumanAuthority(
    'COMMERCIAL_CHANGE_AUTHORIZATION',
    'RoadmapCommitment',
    'id',
  )
  async releaseGate(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RoadmapReleaseGateRequest,
  ) {
    const boundary = scope(headerTenantId, headerEnvironmentId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.roadmap.passReleaseGate(
        boundary.tenantId,
        boundary.environmentId,
        id,
        user.id,
        dto,
      ),
    };
  }
}
