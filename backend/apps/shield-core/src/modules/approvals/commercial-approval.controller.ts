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
import { IsIn, IsString } from 'class-validator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { requireTenantId } from '../../tenant-context';
import {
  CommercialApprovalService,
  RequestApprovalDto,
} from './commercial-approval.service';

export class DecideApprovalDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/commercial/approvals')
export class CommercialApprovalController {
  constructor(private readonly approvalService: CommercialApprovalService) {}

  @Post()
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async requestApproval(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: RequestApprovalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const approval = await this.approvalService.requestApproval({
      ...dto,
      tenantId,
      requestedBy: user.id,
    });
    return { statusCode: HttpStatus.CREATED, data: approval };
  }

  @Get(':id')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_READ)
  async getApproval(
    @Param('id') id: string,
    @Headers('x-tenant-id') headerTenantId: string,
  ) {
    const approval = await this.approvalService.getApprovalByIdForTenant(
      id,
      requireTenantId(headerTenantId),
    );
    return { statusCode: HttpStatus.OK, data: approval };
  }

  @Patch(':id/decision')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async decide(
    @Param('id') id: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: DecideApprovalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.approvalService.getApprovalByIdForTenant(
      id,
      requireTenantId(headerTenantId),
    );
    const approval = await this.approvalService.decideApproval(
      id,
      user.id,
      dto.decision,
      dto.reason,
    );
    return { statusCode: HttpStatus.OK, data: approval };
  }
}
