import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantOffboardingService } from './lifecycle/tenant-offboarding.service';
import { LegalHoldService } from './legal-hold/legal-hold.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PERMISSION_CODES } from '../authorization/constants';

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
  async start(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { reason: string },
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
  async validate(@Param('tenantId') tenantId: string) {
    const holds = await this.legalHoldService.getActiveForTenant(tenantId);
    return { legalHolds: holds, ready: true };
  }

  @Post('start-export')
  async startExport(
    @Param('tenantId') tenantId: string,
    @Body() body: { runId: string },
  ) {
    return this.offboardingService.startFinalExport(tenantId, body.runId);
  }

  @Post('freeze-access')
  async freezeAccess(
    @Param('tenantId') tenantId: string,
    @Body() body: { runId: string },
  ) {
    return this.offboardingService.freezeAccess(tenantId, body.runId);
  }

  @Post('start-deletion')
  @RequirePermissions(PERMISSION_CODES.DELETION_REQUEST)
  async startDeletion(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { runId: string },
  ) {
    await this.offboardingService.revokeConnectors(tenantId, body.runId);
    return this.offboardingService.startDeletion(tenantId, body.runId, user.id);
  }

  @Post('issue-attestation')
  @RequirePermissions(PERMISSION_CODES.DELETION_REQUEST)
  async issueAttestation(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { runId: string },
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
