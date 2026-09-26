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
  RecordRetentionPolicyDto,
} from './dto/privacy-workflow.dto';
import { RetentionPolicyService } from './retention/retention-policy.service';
import { DeletionVerificationService } from './verification/deletion-verification.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/tenants/:tenantId/offboarding')
export class OffboardingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offboardingService: TenantOffboardingService,
    private readonly legalHoldService: LegalHoldService,
    private readonly retentionPolicyService: RetentionPolicyService,
    private readonly verificationService: DeletionVerificationService,
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

  /**
   * Resumes a purge that failed or is waiting on retention expiry. Completed
   * stores are not repeated; only incomplete work runs again.
   */
  @Post('resume-deletion')
  @RequirePermissions(PERMISSION_CODES.DELETION_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async resumeDeletion(
    @Param('tenantId') tenantId: string,
    @Body() body: OffboardingRunDto,
  ) {
    return this.offboardingService.resumeDeletion(tenantId, body.runId);
  }

  @Get('deletion-verification')
  async getVerification(@Param('tenantId') tenantId: string) {
    const run = await this.prisma.tenantOffboardingRun.findFirst({
      where: { tenant_id: tenantId },
      orderBy: { initiated_at: 'desc' },
    });
    if (!run?.deletion_request_id) return null;
    return this.verificationService.latest(run.deletion_request_id);
  }

  /**
   * The authoritative retention schedule that decides when this tenant's data
   * may actually be destroyed. Approval alone never makes data destroyable.
   */
  @Post('retention-policy')
  @RequirePermissions(PERMISSION_CODES.DELETION_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async recordRetentionPolicy(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: RecordRetentionPolicyDto,
  ) {
    return this.retentionPolicyService.record({
      tenantId,
      basis: body.basis,
      authority: body.authority,
      periodDays: body.periodDays,
      createdBy: user.id,
      effectiveFrom: body.effectiveFrom
        ? new Date(body.effectiveFrom)
        : undefined,
      effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : undefined,
    });
  }

  @Get('retention-policy')
  async listRetentionPolicies(@Param('tenantId') tenantId: string) {
    return this.retentionPolicyService.listForTenant(tenantId);
  }

  /**
   * Legal holds standing over this tenant (W36).
   *
   * A hold is the reason a deletion does not complete, so it has to be
   * readable next to the deletion it blocks — otherwise an offboarding run
   * that stops part-way looks like a failure rather than the control working.
   */
  @Get('legal-holds')
  async listLegalHolds(@Param('tenantId') tenantId: string) {
    return this.prisma.legalHold.findMany({
      where: { tenant_id: tenantId },
      orderBy: { starts_at: 'desc' },
    });
  }

  /**
   * Backup expiry for this tenant's deletion (W36). Deleting live data does
   * not delete it from backups; the tenant's data is gone when these records
   * say the backups carrying it have aged out, not before.
   */
  @Get('backup-expiry')
  async listBackupExpiry(@Param('tenantId') tenantId: string) {
    return this.prisma.backupExpiryRecord.findMany({
      where: { tenant_id: tenantId },
      orderBy: { final_expiry_expected_at: 'asc' },
    });
  }

  @Get('deletion-attestation')
  async getAttestation(@Param('tenantId') tenantId: string) {
    return this.prisma.deletionAttestation.findFirst({
      where: { tenant_id: tenantId },
      orderBy: { issued_at: 'desc' },
    });
  }
}
