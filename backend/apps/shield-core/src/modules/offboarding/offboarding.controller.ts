import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantOffboardingService } from './lifecycle/tenant-offboarding.service';
import { LegalHoldService } from './legal-hold/legal-hold.service';

@Controller('api/v1/tenants/:tenantId/offboarding')
export class OffboardingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offboardingService: TenantOffboardingService,
    private readonly legalHoldService: LegalHoldService,
  ) {}

  @Post()
  async start(@Param('tenantId') tenantId: string, @Headers('x-actor-id') actorId: string, @Body() body: { reason: string }) {
    return this.offboardingService.start(tenantId, actorId ?? 'unknown-actor', body.reason);
  }

  @Get()
  async get(@Param('tenantId') tenantId: string) {
    return this.prisma.tenantOffboardingRun.findFirst({ where: { tenant_id: tenantId }, orderBy: { initiated_at: 'desc' } });
  }

  @Post('validate')
  async validate(@Param('tenantId') tenantId: string) {
    const holds = await this.legalHoldService.getActiveForTenant(tenantId);
    return { legalHolds: holds, ready: true };
  }

  @Post('start-export')
  async startExport(@Param('tenantId') tenantId: string, @Body() body: { runId: string }) {
    return this.offboardingService.startFinalExport(tenantId, body.runId);
  }

  @Post('freeze-access')
  async freezeAccess(@Param('tenantId') tenantId: string, @Body() body: { runId: string }) {
    return this.offboardingService.freezeAccess(tenantId, body.runId);
  }

  @Post('start-deletion')
  async startDeletion(@Param('tenantId') tenantId: string, @Headers('x-actor-id') actorId: string, @Body() body: { runId: string }) {
    await this.offboardingService.revokeConnectors(tenantId, body.runId).catch(() => null);
    return this.offboardingService.startDeletion(tenantId, body.runId, actorId ?? 'unknown-actor');
  }

  @Get('deletion-attestation')
  async getAttestation(@Param('tenantId') tenantId: string) {
    return this.prisma.deletionAttestation.findFirst({ where: { tenant_id: tenantId }, orderBy: { issued_at: 'desc' } });
  }
}
