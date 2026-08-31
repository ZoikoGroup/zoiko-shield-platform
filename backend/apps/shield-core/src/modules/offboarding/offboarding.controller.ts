import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantOffboardingService } from './lifecycle/tenant-offboarding.service';
import { LegalHoldService } from './legal-hold/legal-hold.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { HumanAuthorityGuard } from '../human-authority/human-authority.guard';
import { RequireHumanAuthority } from '../human-authority/human-authority.decorator';
import {
  ApproveDeletionDto,
  OffboardingReasonDto,
  OffboardingRunDto,
} from './dto/privacy-workflow.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/tenants/:tenantId/offboarding')
export class OffboardingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offboardingService: TenantOffboardingService,
    private readonly legalHoldService: LegalHoldService,
  ) {}

  @Post()
  @RequirePermissions(PERMISSION_CODES.TENANT_OFFBOARDING_START)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async start(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: OffboardingReasonDto,
  ) {
    return this.offboardingService.start(tenantId, user.id, body.reason);
  }

  @Get()
  async get(@Param('tenantId') tenantId: string) {
    return this.prisma.tenantOffboardingRun.findFirst({
      where: { tenant_id: tenantId },
      orderBy: { initiated_at: 'desc' },
    });
  }

  @Post('validate')
  @RequirePermissions(PERMISSION_CODES.TENANT_OFFBOARDING_START)
  async validate(@Param('tenantId') tenantId: string) {
    const holds = await this.legalHoldService.getActiveForTenant(tenantId);
    return { legalHolds: holds, ready: true };
  }

  @Post('start-export')
  @RequirePermissions(PERMISSION_CODES.TENANT_OFFBOARDING_START)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async startExport(
    @Param('tenantId') tenantId: string,
    @Body() body: OffboardingRunDto,
  ) {
    return this.offboardingService.startFinalExport(tenantId, body.runId);
  }

  @Post('freeze-access')
  @RequirePermissions(PERMISSION_CODES.TENANT_OFFBOARDING_START)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async freezeAccess(
    @Param('tenantId') tenantId: string,
    @Body() body: OffboardingRunDto,
  ) {
    return this.offboardingService.freezeAccess(tenantId, body.runId);
  }

  @Post('start-deletion')
  @RequirePermissions(
    PERMISSION_CODES.TENANT_OFFBOARDING_START,
    PERMISSION_CODES.DELETION_REQUEST,
  )
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async startDeletion(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: OffboardingRunDto,
  ) {
    await this.offboardingService.revokeConnectors(tenantId, body.runId);
    return this.offboardingService.startDeletion(
      tenantId,
      body.runId,
      user.id,
      user.tenantId,
    );
  }

  @Post('approve-deletion')
  @UseGuards(HumanAuthorityGuard)
  @RequirePermissions(PERMISSION_CODES.DELETION_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  @RequireHumanAuthority(
    'DATA_DELETION_AUTHORIZATION',
    'DeletionRequest',
    undefined,
    true,
  )
  async approveDeletion(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ApproveDeletionDto,
  ) {
    return this.offboardingService.approveAndExecuteDeletion(
      tenantId,
      body.runId,
      user.id,
      body.decisionReason,
      user.tenantId,
    );
  }

  @Post('issue-attestation')
  @RequirePermissions(PERMISSION_CODES.DELETION_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async issueAttestation(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: OffboardingRunDto,
  ) {
    return this.offboardingService.issueAttestationAndClose(
      tenantId,
      body.runId,
      user.id,
    );
  }

  @Get('deletion-attestation')
  async getAttestation(@Param('tenantId') tenantId: string) {
    return this.prisma.deletionAttestation.findFirst({
      where: { tenant_id: tenantId },
      orderBy: { issued_at: 'desc' },
    });
  }
}
