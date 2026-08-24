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
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { PlatformPermissionsGuard } from '../authorization/guards/platform-permissions.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { RequirePlatformPermissions } from '../authorization/decorators/require-platform-permissions.decorator';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { requireTenantId } from '../../tenant-context';
import {
  CommercialAccountService,
  CreateCommercialAccountBindingDto,
  CreateCommercialAccountDto,
  CreateGroupAccountDto,
  UpdateCommercialAccountBindingStatusDto,
} from './commercial-account.service';
import {
  CommercialAccountChangeService,
  DecideCommercialAccountChangeDto,
  RequestCommercialAccountChangeDto,
} from './commercial-account-change.service';

@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
@RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_COMMERCIAL_ACCOUNT_MANAGE)
@RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
@Controller('api/v1/commercial/group-accounts')
export class PlatformCommercialGroupAccountController {
  constructor(
    private readonly commercialAccountService: CommercialAccountService,
  ) {}

  @Post()
  async createGroupAccount(
    @Body() dto: CreateGroupAccountDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const group = await this.commercialAccountService.createGroupAccount(
      dto,
      user.id,
    );
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Commercial group account created successfully',
      data: group,
    };
  }
}

/** Plane-1 account mutations are never authorized by customer-tenant roles. */
@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
@RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_COMMERCIAL_ACCOUNT_MANAGE)
@RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
@Controller('api/v1/commercial/accounts')
export class PlatformCommercialAccountController {
  constructor(
    private readonly commercialAccountService: CommercialAccountService,
  ) {}

  @Post()
  async createCommercialAccount(
    @Body() dto: CreateCommercialAccountDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const account = await this.commercialAccountService.createCommercialAccount(
      dto,
      user.id,
    );
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Commercial account created successfully',
      data: account,
    };
  }

  @Post(':accountId/bindings')
  async createBinding(
    @Param('accountId') accountId: string,
    @Body() dto: CreateCommercialAccountBindingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const binding = await this.commercialAccountService.createBinding(
      accountId,
      dto,
      user.id,
    );
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Commercial account binding created successfully',
      data: binding,
    };
  }

  @Patch(':accountId/bindings/:bindingId/status')
  async updateBindingStatus(
    @Param('accountId') accountId: string,
    @Param('bindingId') bindingId: string,
    @Body() dto: UpdateCommercialAccountBindingStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const binding = await this.commercialAccountService.updateBindingStatus(
      accountId,
      bindingId,
      dto,
      user.id,
    );
    return { statusCode: HttpStatus.OK, data: binding };
  }
}

/** Customer views resolve the payer only through an explicit tenant binding. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_READ)
@Controller('api/v1/commercial/accounts')
export class TenantCommercialAccountController {
  constructor(
    private readonly commercialAccountService: CommercialAccountService,
    private readonly commercialAccountChangeService: CommercialAccountChangeService,
  ) {}

  @Get()
  async listCommercialAccounts(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const accounts =
      await this.commercialAccountService.listCommercialAccountsForTenant(
        tenantId,
        user.environmentId,
      );
    return { statusCode: HttpStatus.OK, data: accounts };
  }

  @Get(':accountId')
  async getCommercialAccount(
    @Param('accountId') accountId: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const account =
      await this.commercialAccountService.getCommercialAccountForTenant(
        accountId,
        tenantId,
        user.environmentId,
      );
    return { statusCode: HttpStatus.OK, data: account };
  }

  @Get(':accountId/bindings')
  async getBindings(
    @Param('accountId') accountId: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const bindings = await this.commercialAccountService.getBindingsForTenant(
      accountId,
      tenantId,
      user.environmentId,
    );
    return { statusCode: HttpStatus.OK, data: bindings };
  }

  @Get(':accountId/group-summary')
  async getGroupSummary(
    @Param('accountId') accountId: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const summary =
      await this.commercialAccountService.getGroupSummaryForTenant(
        accountId,
        tenantId,
        user.environmentId,
      );
    return { statusCode: HttpStatus.OK, data: summary };
  }

  @Post(':accountId/change-requests')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async requestChange(
    @Param('accountId') accountId: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestCommercialAccountChangeDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const approval = await this.commercialAccountChangeService.requestChange(
      accountId,
      tenantId,
      user.environmentId,
      user.id,
      dto,
    );
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Commercial account change submitted for independent approval',
      data: approval,
    };
  }

  @Get(':accountId/change-requests')
  async listChanges(
    @Param('accountId') accountId: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const approvals = await this.commercialAccountChangeService.listChanges(
      accountId,
      tenantId,
      user.environmentId,
    );
    return { statusCode: HttpStatus.OK, data: approvals };
  }

  @Patch(':accountId/change-requests/:approvalId/decision')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async decideChange(
    @Param('accountId') accountId: string,
    @Param('approvalId') approvalId: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DecideCommercialAccountChangeDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const approval = await this.commercialAccountChangeService.decideChange(
      accountId,
      approvalId,
      tenantId,
      user.environmentId,
      user.id,
      dto,
    );
    return { statusCode: HttpStatus.OK, data: approval };
  }

  @Post(':accountId/change-requests/:approvalId/apply')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async applyChange(
    @Param('accountId') accountId: string,
    @Param('approvalId') approvalId: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const result = await this.commercialAccountChangeService.applyChange(
      accountId,
      approvalId,
      tenantId,
      user.environmentId,
      user.id,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Approved commercial account change applied',
      data: result,
    };
  }
}
