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
import { PERMISSION_CODES } from '../authorization/constants';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { requireTenantId } from '../../tenant-context';
import {
  CreatePartnerSupportCaseDto,
  PartnerOperationsService,
  UpdatePartnerSupportCaseDto,
} from './partner-operations.service';
import { RequirePartnerDelegationScope } from './require-partner-delegation-scope.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_PARTNER_DELEGATION_USE)
@Controller('api/v1/partners/delegated/accounts/:accountId')
export class PartnerOperationsController {
  constructor(private readonly operationsService: PartnerOperationsService) {}

  @Get('usage')
  @RequirePartnerDelegationScope('VIEW_USAGE')
  async getUsage(
    @Param('accountId') accountId: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-managing-organization-id') managingOrganizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const usage = await this.operationsService.getUsage(
      this.boundary(accountId, headerTenantId, managingOrganizationId, user),
    );
    return { statusCode: HttpStatus.OK, data: usage };
  }

  @Get('invoices')
  @RequirePartnerDelegationScope('VIEW_INVOICES')
  async getInvoices(
    @Param('accountId') accountId: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-managing-organization-id') managingOrganizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const invoices = await this.operationsService.getInvoices(
      this.boundary(accountId, headerTenantId, managingOrganizationId, user),
    );
    return { statusCode: HttpStatus.OK, data: invoices };
  }

  @Get('entitlements')
  @RequirePartnerDelegationScope('VIEW_ENTITLEMENTS')
  async getEntitlements(
    @Param('accountId') accountId: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-managing-organization-id') managingOrganizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const entitlements = await this.operationsService.getEntitlements(
      this.boundary(accountId, headerTenantId, managingOrganizationId, user),
    );
    return { statusCode: HttpStatus.OK, data: entitlements };
  }

  @Get('support-cases')
  @RequirePartnerDelegationScope('VIEW_TICKETS')
  async listSupportCases(
    @Param('accountId') accountId: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-managing-organization-id') managingOrganizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const supportCases = await this.operationsService.listSupportCases(
      this.boundary(accountId, headerTenantId, managingOrganizationId, user),
    );
    return { statusCode: HttpStatus.OK, data: supportCases };
  }

  @Post('support-cases')
  @RequirePartnerDelegationScope('MANAGE_SUPPORT_CASES')
  async createSupportCase(
    @Param('accountId') accountId: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-managing-organization-id') managingOrganizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePartnerSupportCaseDto,
  ) {
    const supportCase = await this.operationsService.createSupportCase(
      this.boundary(accountId, headerTenantId, managingOrganizationId, user),
      dto,
    );
    return { statusCode: HttpStatus.CREATED, data: supportCase };
  }

  @Patch('support-cases/:supportCaseId')
  @RequirePartnerDelegationScope('MANAGE_SUPPORT_CASES')
  async updateSupportCase(
    @Param('accountId') accountId: string,
    @Param('supportCaseId') supportCaseId: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-managing-organization-id') managingOrganizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePartnerSupportCaseDto,
  ) {
    const supportCase = await this.operationsService.updateSupportCase(
      this.boundary(accountId, headerTenantId, managingOrganizationId, user),
      supportCaseId,
      dto,
    );
    return { statusCode: HttpStatus.OK, data: supportCase };
  }

  private boundary(
    accountId: string,
    headerTenantId: string,
    managingOrganizationId: string,
    user: AuthenticatedUser,
  ) {
    return {
      commercialAccountId: accountId,
      tenantId: requireTenantId(headerTenantId),
      environmentId: user.environmentId,
      principalId: user.id,
      managingOrganizationId,
    };
  }
}
