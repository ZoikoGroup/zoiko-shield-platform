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
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { PlatformPermissionsGuard } from '../authorization/guards/platform-permissions.guard';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { RequirePlatformPermissions } from '../authorization/decorators/require-platform-permissions.decorator';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { requireTenantId } from '../../tenant-context';
import {
  CreatePartnerDto,
  CreatePartnerAgreementDto,
  CreatePartnerPrincipalContextDto,
  DeactivatePartnerPrincipalContextDto,
  PartnerService,
} from './partner.service';
import {
  GrantDelegationDto,
  PartnerDelegationService,
  RevokeDelegationDto,
} from './partner-delegation.service';
import {
  CalculateSettlementDto,
  PartnerSettlementService,
} from './partner-settlement.service';

@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
@RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_COMMERCIAL_ACCOUNT_MANAGE)
@RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
@Controller('api/v1/partners')
export class PartnerController {
  constructor(private readonly partnerService: PartnerService) {}

  @Post()
  async create(@Body() dto: CreatePartnerDto) {
    const partner = await this.partnerService.createPartner(dto);
    return { statusCode: HttpStatus.CREATED, data: partner };
  }

  @Post('agreements')
  async createAgreement(@Body() dto: CreatePartnerAgreementDto) {
    const agreement = await this.partnerService.createAgreement(dto);
    return { statusCode: HttpStatus.CREATED, data: agreement };
  }

  @Patch('agreements/:id/approve')
  async approveAgreement(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const agreement = await this.partnerService.approveAgreement(id, user.id);
    return { statusCode: HttpStatus.OK, data: agreement };
  }

  @Post(':partnerId/principals')
  async createPrincipalContext(
    @Param('partnerId') partnerId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePartnerPrincipalContextDto,
  ) {
    const context = await this.partnerService.createPrincipalContext(
      partnerId,
      user.id,
      dto,
    );
    return { statusCode: HttpStatus.CREATED, data: context };
  }

  @Get(':partnerId/principals')
  async listPrincipalContexts(@Param('partnerId') partnerId: string) {
    const contexts = await this.partnerService.listPrincipalContexts(partnerId);
    return { statusCode: HttpStatus.OK, data: contexts };
  }

  @Patch(':partnerId/principals/:contextId/deactivate')
  async deactivatePrincipalContext(
    @Param('partnerId') partnerId: string,
    @Param('contextId') contextId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeactivatePartnerPrincipalContextDto,
  ) {
    const context = await this.partnerService.deactivatePrincipalContext(
      partnerId,
      contextId,
      user.id,
      dto.reason,
    );
    return { statusCode: HttpStatus.OK, data: context };
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/partners/delegations')
export class PartnerDelegationController {
  constructor(private readonly delegationService: PartnerDelegationService) {}

  @Post()
  @RequirePermissions(PERMISSION_CODES.TENANT_PARTNER_DELEGATION_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async grant(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GrantDelegationDto,
  ) {
    const delegation = await this.delegationService.grantDelegation(
      requireTenantId(headerTenantId),
      user.environmentId,
      user.id,
      dto,
    );
    return { statusCode: HttpStatus.CREATED, data: delegation };
  }

  @Get()
  @RequirePermissions(PERMISSION_CODES.TENANT_PARTNER_DELEGATION_READ)
  async list(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('commercialAccountId') commercialAccountId?: string,
  ) {
    const delegations = await this.delegationService.listForCustomer(
      requireTenantId(headerTenantId),
      user.environmentId,
      commercialAccountId,
    );
    return { statusCode: HttpStatus.OK, data: delegations };
  }

  @Patch(':id/revoke')
  @RequirePermissions(PERMISSION_CODES.TENANT_PARTNER_DELEGATION_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async revoke(
    @Param('id') id: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RevokeDelegationDto,
  ) {
    const delegation = await this.delegationService.revoke(
      id,
      requireTenantId(headerTenantId),
      user.environmentId,
      user.id,
      dto.reason,
    );
    return { statusCode: HttpStatus.OK, data: delegation };
  }

  @Get('check')
  @RequirePermissions(PERMISSION_CODES.TENANT_PARTNER_DELEGATION_USE)
  async check(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('managingOrganizationId') managingOrganizationId: string,
    @Query('commercialAccountId') commercialAccountId: string,
    @Query('scope') scope: string,
  ) {
    const allowed = await this.delegationService.checkDelegation({
      tenantId: requireTenantId(headerTenantId),
      environmentId: user.environmentId,
      partnerPrincipalId: user.id,
      managingOrganizationId,
      commercialAccountId,
      requiredScope: scope,
    });
    return { statusCode: HttpStatus.OK, data: { allowed } };
  }
}

@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
@RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_COMMERCIAL_ACCOUNT_MANAGE)
@RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
@Controller('api/v1/partners/settlements')
export class PartnerSettlementController {
  constructor(private readonly settlementService: PartnerSettlementService) {}

  @Post()
  async calculate(@Body() dto: CalculateSettlementDto) {
    const settlement = await this.settlementService.calculateSettlement(dto);
    return { statusCode: HttpStatus.CREATED, data: settlement };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const settlement = await this.settlementService.getSettlementById(id);
    return { statusCode: HttpStatus.OK, data: settlement };
  }

  @Patch(':id/approve')
  async approve(@Param('id') id: string) {
    const settlement = await this.settlementService.approveSettlement(id);
    return { statusCode: HttpStatus.OK, data: settlement };
  }

  @Patch(':id/mark-paid')
  async markPaid(@Param('id') id: string) {
    const settlement = await this.settlementService.markPaid(id);
    return { statusCode: HttpStatus.OK, data: settlement };
  }
}
