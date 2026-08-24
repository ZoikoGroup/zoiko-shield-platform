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
import { PERMISSION_CODES } from '../authorization/constants';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { requireTenantId } from '../../tenant-context';
import {
  CorporateTransferService,
  CreateCorporateTransferDto,
  DecideCorporateTransferDto,
  ReconcileCorporateTransferDto,
} from './corporate-transfer.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_READ)
@Controller('api/v1/commercial/transfers')
export class CorporateTransferController {
  constructor(private readonly transferService: CorporateTransferService) {}

  @Post()
  @RequirePermissions(PERMISSION_CODES.TENANT_CORPORATE_TRANSFER_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async requestTransfer(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCorporateTransferDto,
  ) {
    const transfer = await this.transferService.requestTransfer(
      requireTenantId(headerTenantId),
      user.environmentId,
      user.id,
      dto,
    );
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Corporate transfer plan submitted for participant approval',
      data: transfer,
    };
  }

  @Get()
  async listTransfers(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('commercialAccountId') commercialAccountId?: string,
  ) {
    const transfers = await this.transferService.listForParticipant(
      requireTenantId(headerTenantId),
      user.environmentId,
      commercialAccountId,
    );
    return { statusCode: HttpStatus.OK, data: transfers };
  }

  @Patch(':transferId/decision')
  @RequirePermissions(PERMISSION_CODES.TENANT_CORPORATE_TRANSFER_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async decideTransfer(
    @Param('transferId') transferId: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DecideCorporateTransferDto,
  ) {
    const transfer = await this.transferService.decideTransfer(
      transferId,
      requireTenantId(headerTenantId),
      user.environmentId,
      user.id,
      dto,
    );
    return { statusCode: HttpStatus.OK, data: transfer };
  }

  @Post(':transferId/execute')
  @RequirePermissions(PERMISSION_CODES.TENANT_CORPORATE_TRANSFER_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async executeTransfer(
    @Param('transferId') transferId: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const transfer = await this.transferService.executeTransfer(
      transferId,
      requireTenantId(headerTenantId),
      user.environmentId,
      user.id,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Approved corporate transfer executed at its boundary',
      data: transfer,
    };
  }

  @Post(':transferId/reconcile')
  @RequirePermissions(PERMISSION_CODES.TENANT_CORPORATE_TRANSFER_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async reconcileTransfer(
    @Param('transferId') transferId: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReconcileCorporateTransferDto,
  ) {
    const transfer = await this.transferService.reconcileTransfer(
      transferId,
      requireTenantId(headerTenantId),
      user.environmentId,
      user.id,
      dto,
    );
    return { statusCode: HttpStatus.OK, data: transfer };
  }
}
