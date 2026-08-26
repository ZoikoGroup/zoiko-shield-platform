import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDefined, ValidateNested } from 'class-validator';
import { requireEnvironmentId, requireTenantId } from '../../tenant-context';
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
import {
  CreateDiscountAuthorityPolicyDto,
  DecideDiscountAuthorityPolicyDto,
  DecideQuoteDiscountDto,
  DiscountApprovalService,
} from './discount-approval.service';

class PolicyDecisionRequest extends DecideDiscountAuthorityPolicyDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => HumanAuthorityAttestationDto)
  humanAuthority!: HumanAuthorityAttestationDto;
}

class QuoteDiscountDecisionRequest extends DecideQuoteDiscountDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => HumanAuthorityAttestationDto)
  humanAuthority!: HumanAuthorityAttestationDto;
}

@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
@RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
@Controller('api/v1/platform/cpq/discount-authority-policies')
export class PlatformDiscountAuthorityPolicyController {
  constructor(private readonly discounts: DiscountApprovalService) {}

  @Post()
  @RequirePlatformPermissions(
    PERMISSION_CODES.PLATFORM_DISCOUNT_POLICY_MANAGE,
  )
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDiscountAuthorityPolicyDto,
  ) {
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.discounts.createPolicy(dto, user.id),
    };
  }

  @Get()
  @RequirePlatformPermissions(
    PERMISSION_CODES.PLATFORM_DISCOUNT_POLICY_MANAGE,
  )
  async list(
    @Query('serviceClass') serviceClass?: string,
    @Query('region') region?: string,
    @Query('currency') currency?: string,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.discounts.listPolicies({
        serviceClass,
        region,
        currency,
      }),
    };
  }

  @Patch(':id/decision')
  @UseGuards(HumanAuthorityGuard)
  @RequirePlatformPermissions(
    PERMISSION_CODES.PLATFORM_DISCOUNT_POLICY_APPROVE,
  )
  @RequireHumanAuthority(
    'COMMERCIAL_CHANGE_AUTHORIZATION',
    'DiscountAuthorityPolicy',
    'id',
  )
  async decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PolicyDecisionRequest,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.discounts.decidePolicy(id, user.id, dto),
    };
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_READ)
@Controller('api/v1/cpq/quotes/:quoteId/discount-review')
export class TenantQuoteDiscountReviewController {
  constructor(private readonly discounts: DiscountApprovalService) {}

  @Get()
  async get(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('quoteId') quoteId: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user.tenantId);
    const environmentId = requireEnvironmentId(
      headerEnvironmentId,
      user.environmentId,
    );
    return {
      statusCode: HttpStatus.OK,
      data: await this.discounts.getReview(
        quoteId,
        tenantId,
        environmentId,
      ),
    };
  }

  @Patch('decision')
  @UseGuards(HumanAuthorityGuard)
  @RequirePermissions(PERMISSION_CODES.TENANT_DISCOUNT_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  @RequireHumanAuthority(
    'COMMERCIAL_CHANGE_AUTHORIZATION',
    'QuoteDiscountReview',
    'quoteId',
  )
  async decide(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('quoteId') quoteId: string,
    @Body() dto: QuoteDiscountDecisionRequest,
  ) {
    const tenantId = requireTenantId(headerTenantId, user.tenantId);
    const environmentId = requireEnvironmentId(
      headerEnvironmentId,
      user.environmentId,
    );
    return {
      statusCode: HttpStatus.OK,
      data: await this.discounts.decideQuote(
        quoteId,
        tenantId,
        environmentId,
        user.id,
        dto,
      ),
    };
  }
}
