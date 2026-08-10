import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { RiskService } from './risks/risk.service';
import { RiskTreatmentService } from './treatments/risk-treatment.service';
import { RiskAcceptanceService } from './acceptances/risk-acceptance.service';
import { ExceptionService } from './exceptions/exception.service';

@Controller('api/v1')
export class RiskController {
  constructor(
    private readonly riskService: RiskService,
    private readonly riskTreatmentService: RiskTreatmentService,
    private readonly riskAcceptanceService: RiskAcceptanceService,
    private readonly exceptionService: ExceptionService,
  ) {}

  @Get('risks')
  async list(@Headers('x-tenant-id') tenantId: string) {
    return this.riskService.list(tenantId ?? 'default-tenant');
  }

  @Post('risks')
  async create(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: { title: string; description: string; sourceType: string; sourceId: string; likelihood: string; impact: string; ownerId: string; factors: Array<{ factor: string; value: string; contribution: number; sourceRef: string; evaluatorVersion?: string }> },
  ) {
    return this.riskService.create({ tenantId: tenantId ?? 'default-tenant', ...body });
  }

  @Get('risks/:riskId')
  async getById(@Headers('x-tenant-id') tenantId: string, @Param('riskId') riskId: string) {
    return this.riskService.getWithFactors(tenantId ?? 'default-tenant', riskId);
  }

  @Patch('risks/:riskId')
  async update(@Headers('x-tenant-id') tenantId: string, @Param('riskId') riskId: string) {
    return this.riskService.assertTenantOwnership(tenantId ?? 'default-tenant', riskId);
  }

  @Post('risks/:riskId/treatments')
  async addTreatment(
    @Headers('x-tenant-id') tenantId: string,
    @Param('riskId') riskId: string,
    @Body() body: { treatmentType: 'MITIGATE' | 'TRANSFER' | 'AVOID' | 'ACCEPT'; plan: string; ownerId: string; dueAt?: string },
  ) {
    return this.riskTreatmentService.create({ tenantId: tenantId ?? 'default-tenant', riskId, treatmentType: body.treatmentType, plan: body.plan, ownerId: body.ownerId, dueAt: body.dueAt ? new Date(body.dueAt) : undefined });
  }

  @Post('risks/:riskId/accept')
  async accept(
    @Headers('x-tenant-id') tenantId: string,
    @Param('riskId') riskId: string,
    @Body() body: { acceptedBy: string; authority: string; rationale: string; compensatingControls: string[]; expiresAt: string; reviewAt: string },
  ) {
    return this.riskAcceptanceService.create({
      tenantId: tenantId ?? 'default-tenant',
      riskId,
      acceptedBy: body.acceptedBy,
      authority: body.authority,
      rationale: body.rationale,
      compensatingControls: body.compensatingControls,
      validFrom: new Date(),
      expiresAt: new Date(body.expiresAt),
      reviewAt: new Date(body.reviewAt),
    });
  }

  @Get('exceptions')
  async listExceptions(@Headers('x-tenant-id') tenantId: string) {
    return { tenantId: tenantId ?? 'default-tenant' };
  }

  @Post('exceptions')
  async requestException(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-actor-id') actorId: string,
    @Body() body: { controlObjectiveId?: string; controlImplementationId?: string; requirementId?: string; riskId?: string; reason: string; compensatingControls: string[]; startsAt: string; expiresAt: string },
  ) {
    return this.exceptionService.request({ tenantId: tenantId ?? 'default-tenant', requestedBy: actorId ?? 'unknown-actor', ...body, startsAt: new Date(body.startsAt), expiresAt: new Date(body.expiresAt) });
  }

  @Post('exceptions/:id/approve')
  async approveException(@Headers('x-tenant-id') tenantId: string, @Headers('x-actor-id') actorId: string, @Param('id') id: string) {
    return this.exceptionService.approve(tenantId ?? 'default-tenant', id, actorId ?? 'unknown-actor');
  }

  @Post('exceptions/:id/revoke')
  async revokeException(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.exceptionService.revoke(tenantId ?? 'default-tenant', id);
  }
}
