import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { RequireHumanAuthority } from '../human-authority/human-authority.decorator';
import { HumanAuthorityGuard } from '../human-authority/human-authority.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import {
  CreateDeletionRequestDto,
  CreateLegalHoldDto,
} from './dto/privacy-workflow.dto';
import { DeletionRequestService } from './deletion/deletion-request.service';
import { LegalHoldService } from './legal-hold/legal-hold.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/tenants/:tenantId/privacy')
export class PrivacyOperationsController {
  constructor(
    private readonly deletionRequests: DeletionRequestService,
    private readonly legalHolds: LegalHoldService,
  ) {}

  @Post('deletion-requests')
  @RequirePermissions(PERMISSION_CODES.DELETION_REQUEST)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async requestDeletion(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDeletionRequestDto,
  ) {
    return this.deletionRequests.request({
      tenantId,
      authorizationScopeId: user.tenantId,
      requestedBy: user.id,
      requestAuthority: dto.requestAuthority,
      subjectReference: dto.subjectReference,
      reason: dto.reason,
      scope: dto.scope,
      statutoryDeadlineAt: dto.statutoryDeadlineAt
        ? new Date(dto.statutoryDeadlineAt)
        : undefined,
    });
  }

  @Get('deletion-requests')
  @RequirePermissions(PERMISSION_CODES.DELETION_APPROVE)
  async listDeletionRequests(@Param('tenantId') tenantId: string) {
    return this.deletionRequests.listForTenant(tenantId);
  }

  @Get('deletion-requests/:requestId')
  @RequirePermissions(PERMISSION_CODES.DELETION_APPROVE)
  async getDeletionRequest(
    @Param('tenantId') tenantId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.deletionRequests.getForTenant(tenantId, requestId);
  }

  @Post('legal-holds')
  @UseGuards(HumanAuthorityGuard)
  @RequirePermissions(PERMISSION_CODES.LEGAL_HOLD_CREATE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  @RequireHumanAuthority(
    'LEGAL_HOLD_AUTHORIZATION',
    'LegalHold',
    undefined,
    true,
  )
  async createLegalHold(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLegalHoldDto,
  ) {
    return this.legalHolds.create({
      tenantId,
      authorizationScopeId: user.tenantId,
      scope: dto.scope,
      authority: dto.authority,
      reason: dto.reason,
      reviewAt: new Date(dto.reviewAt),
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      createdBy: user.id,
    });
  }

  @Get('legal-holds')
  @RequirePermissions(PERMISSION_CODES.LEGAL_HOLD_CREATE)
  async listLegalHolds(@Param('tenantId') tenantId: string) {
    return this.legalHolds.getActiveForTenant(tenantId);
  }
}
