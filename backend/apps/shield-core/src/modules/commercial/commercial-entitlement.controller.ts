import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Headers,
  Body,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import {
  requireEnvironmentId,
  requireRegion,
  requireTenantId,
} from '../../tenant-context';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import {
  CommercialEntitlementService,
  GrantEntitlementDto,
} from './commercial-entitlement.service';
import { CLAIM_CHANNELS, ClaimRegisterService } from './claim-register.service';
import type { ClaimChannel } from './claim-register.service';

export class CheckEntitlementQueryDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsString()
  offerType!: string;
}

export class CheckClaimQueryDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsString()
  claimKey!: string;

  @IsOptional()
  @IsString()
  sectorPackKey?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsIn(CLAIM_CHANNELS)
  channel?: ClaimChannel;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/commercial')
export class CommercialEntitlementController {
  constructor(
    private readonly commercialService: CommercialEntitlementService,
    private readonly claimRegisterService: ClaimRegisterService,
  ) {}

  /**
   * POST /api/v1/commercial/entitlements
   * Issue versioned offer entitlement
   */
  @Post('entitlements')
  async grantEntitlement(@Body() dto: GrantEntitlementDto) {
    const entitlement = await this.commercialService.grantEntitlement(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Entitlement granted successfully',
      data: entitlement,
    };
  }

  /**
   * PATCH /api/v1/commercial/entitlements/:id/status
   * Guarded status transition (Part 20 state-machine hardening)
   */
  @Patch('entitlements/:id/status')
  async updateEntitlementStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    const entitlement = await this.commercialService.updateEntitlementStatus(
      id,
      status,
    );
    return {
      statusCode: HttpStatus.OK,
      data: entitlement,
    };
  }

  /**
   * GET /api/v1/commercial/entitlements
   * List active entitlements for tenant
   */
  @Get('entitlements')
  async getEntitlements(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const result =
      await this.commercialService.getEntitlementsByTenant(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data: result,
    };
  }

  /**
   * GET /api/v1/commercial/entitlements/check
   * Check if tenant has active entitlement (ADR-06 fail-closed rule)
   */
  @Get('entitlements/check')
  async checkEntitlement(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query() query: CheckEntitlementQueryDto,
  ) {
    const tenantId = requireTenantId(headerTenantId, query.tenantId);
    const isEntitled = await this.commercialService.checkEntitlement(
      tenantId,
      query.offerType,
    );
    return {
      statusCode: HttpStatus.OK,
      data: {
        tenantId,
        offerType: query.offerType,
        isEntitled,
      },
    };
  }

  /**
   * GET /api/v1/commercial/claims/check
   * Verify claim eligibility against entitlement and ClaimRegister
   */
  @Get('claims/check')
  async checkClaimEligibility(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query() query: CheckClaimQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId, query.tenantId);
    const result = await this.claimRegisterService.verifyClaimEligibility({
      tenantId,
      environmentId: requireEnvironmentId(user.environmentId),
      region: requireRegion(user.region, query.region),
      claimKey: query.claimKey,
      channel: query.channel ?? 'PRODUCT_UI',
      sectorPackKey: query.sectorPackKey,
    });
    return {
      statusCode: HttpStatus.OK,
      data: result,
    };
  }
}
