import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RiskService } from './risks/risk.service';
import { RiskTreatmentService } from './treatments/risk-treatment.service';
import { RiskAcceptanceService } from './acceptances/risk-acceptance.service';
import { ExceptionService } from './exceptions/exception.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { requireTenantId } from '../../tenant-context';

@UseGuards(JwtAuthGuard, PermissionsGuard)
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
    return this.riskService.list(requireTenantId(tenantId));
  }

  @Post('risks')
  async create(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: { title: string; description: string; sourceType: string; sourceId: string; likelihood: string; impact: string; ownerId: string; factors: Array<{ factor: string; value: string; contribution: number; sourceRef: string; evaluatorVersion?: string }> },
  ) {
    return this.riskService.create({ tenantId: requireTenantId(tenantId), ...body });
  }

  @Get('risks/:riskId')
  async getById(@Headers('x-tenant-id') tenantId: string, @Param('riskId') riskId: string) {
    return this.riskService.getWithFactors(requireTenantId(tenantId), riskId);
  }

  @Patch('risks/:riskId')
  async update(@Headers('x-tenant-id') tenantId: string, @Param('riskId') riskId: string) {
    return this.riskService.assertTenantOwnership(requireTenantId(tenantId), riskId);
  }

  @Post('risks/:riskId/treatments')
  async addTreatment(
    @Headers('x-tenant-id') tenantId: string,
    @Param('riskId') riskId: string,
    @Body() body: { treatmentType: 'MITIGATE' | 'TRANSFER' | 'AVOID' | 'ACCEPT'; plan: string; ownerId: string; dueAt?: string },
  ) {
    return this.riskTreatmentService.create({ tenantId: requireTenantId(tenantId), riskId, treatmentType: body.treatmentType, plan: body.plan, ownerId: body.ownerId, dueAt: body.dueAt ? new Date(body.dueAt) : undefined });
  }

  @Post('risks/:riskId/accept')
  async accept(
    @Headers('x-tenant-id') tenantId: string,
    @Param('riskId') riskId: string,
    @Body() body: { acceptedBy: string; authority: string; rationale: string; compensatingControls: string[]; expiresAt: string; reviewAt: string },
  ) {
    return this.riskAcceptanceService.create({
      tenantId: requireTenantId(tenantId),
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
    return { tenantId: requireTenantId(tenantId) };
  }

  @Post('exceptions')
  async requestException(
    @Headers('x-tenant-id') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { controlObjectiveId?: string; controlImplementationId?: string; requirementId?: string; riskId?: string; reason: string; compensatingControls: string[]; startsAt: string; expiresAt: string },
  ) {
    return this.exceptionService.request({ tenantId: requireTenantId(tenantId), requestedBy: user.id, ...body, startsAt: new Date(body.startsAt), expiresAt: new Date(body.expiresAt) });
  }

  @Post('exceptions/:id/approve')
  async approveException(@Headers('x-tenant-id') tenantId: string, @CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.exceptionService.approve(requireTenantId(tenantId), id, user.id);
  }

  @Post('exceptions/:id/revoke')
  async revokeException(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.exceptionService.revoke(requireTenantId(tenantId), id);
  }
}
