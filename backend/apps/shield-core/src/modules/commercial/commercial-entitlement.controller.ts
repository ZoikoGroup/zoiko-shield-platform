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
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import {
  CommercialEntitlementService,
  CreateCommercialAccountDto,
  GrantEntitlementDto,
  RegisterClaimDto,
} from './commercial-entitlement.service';

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
}

@UseGuards(JwtAuthGuard)
@Controller('api/v1/commercial')
export class CommercialEntitlementController {
  constructor(
    private readonly commercialService: CommercialEntitlementService,
  ) {}

  /**
   * POST /api/v1/commercial/accounts
   * Create commercial account
   */
  @Post('accounts')
  async createCommercialAccount(@Body() dto: CreateCommercialAccountDto) {
    const account = await this.commercialService.createCommercialAccount(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Commercial account created successfully',
      data: account,
    };
  }

  /**
   * GET /api/v1/commercial/accounts/:accountId
   * Get single commercial account details
   */
  @Get('accounts/:accountId')
  async getCommercialAccountById(@Param('accountId') accountId: string) {
    const account = await this.commercialService.getCommercialAccountById(accountId);
    return {
      statusCode: HttpStatus.OK,
      data: account,
    };
  }

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
    const entitlement = await this.commercialService.updateEntitlementStatus(id, status);
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
    const tenantId = headerTenantId || queryTenantId || 'default-tenant';
    const result = await this.commercialService.getEntitlementsByTenant(tenantId);
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
    const tenantId = headerTenantId || query.tenantId || 'default-tenant';
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
   * POST /api/v1/commercial/claims/register
   * Register approved claim wording in ClaimRegister
   */
  @Post('claims/register')
  async registerClaim(@Body() dto: RegisterClaimDto) {
    const claim = await this.commercialService.registerClaim(dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Claim registered',
      data: claim,
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
  ) {
    const tenantId = headerTenantId || query.tenantId || 'default-tenant';
    const result = await this.commercialService.verifyClaimEligibility(
      tenantId,
      query.claimKey,
      query.sectorPackKey,
      query.region,
    );
    return {
      statusCode: HttpStatus.OK,
      data: result,
    };
  }
}
