import { Controller, Post, Get, Param, Headers, Body, HttpStatus, UseGuards } from '@nestjs/common';
import { ResponseProposalService } from '../services/response-proposal.service';
import { JwtAuthGuard } from '../../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../authorization/guards/permissions.guard';
import { CurrentUser } from '../../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../identity-adapter/interfaces/jwt-payload.interface';
import { requireEnvironmentId, requireTenantId } from '../../../tenant-context';

export class CreateProposalDto {
  caseId?: string;
  alertId?: string;
  targetType!: string;
  targetId!: string;
  actionType!: string;
  reason!: string;
  recommendationSource!: string;
  reversible?: boolean;
  rollbackActionType?: string;
  residualRisk?: string;
  actorId?: string;
}

export class ApproveProposalDto {
  reason?: string;
  actorId?: string;
}

export class RejectProposalDto {
  reason!: string;
  actorId?: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1')
export class ResponseProposalController {
  constructor(private readonly responseProposalService: ResponseProposalService) {}

  private resolveTenantId(headerTenantId: string): string {
    return requireTenantId(headerTenantId);
  }
  @Post('cases/:caseId/response-proposals')
  async create(@Headers('x-tenant-id') headerTenantId: string, @Headers('x-environment-id') environmentId: string, @Param('caseId') caseId: string, @Body() dto: CreateProposalDto, @CurrentUser() user: AuthenticatedUser) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const proposal = await this.responseProposalService.createProposal({
      tenantId,
      environmentId: requireEnvironmentId(environmentId),
      caseId,
      alertId: dto.alertId,
      targetType: dto.targetType,
      targetId: dto.targetId,
      actionType: dto.actionType,
      reason: dto.reason,
      requestedBy: user.id,
      recommendationSource: dto.recommendationSource,
      reversible: dto.reversible,
      rollbackActionType: dto.rollbackActionType,
      residualRisk: dto.residualRisk,
    });
    return { statusCode: HttpStatus.CREATED, data: proposal };
  }

  @Get('cases/:caseId/response-proposals')
  async listForCase(@Headers('x-tenant-id') headerTenantId: string, @Param('caseId') caseId: string) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const proposals = await this.responseProposalService.listForCase(tenantId, caseId);
    return { statusCode: HttpStatus.OK, tenantId, caseId, proposals };
  }

  @Get('response-proposals/:proposalId')
  async getById(@Headers('x-tenant-id') headerTenantId: string, @Param('proposalId') proposalId: string) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const proposal = await this.responseProposalService.getById(tenantId, proposalId);
    return { statusCode: HttpStatus.OK, data: proposal };
  }

  @Post('response-proposals/:proposalId/approve')
  async approve(@Headers('x-tenant-id') headerTenantId: string, @Param('proposalId') proposalId: string, @Body() dto: ApproveProposalDto, @CurrentUser() user: AuthenticatedUser) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const approval = await this.responseProposalService.approve({
      tenantId,
      proposalId,
      approverId: user.id,
      reason: dto.reason,
    });
    return { statusCode: HttpStatus.OK, data: approval };
  }

  @Post('response-proposals/:proposalId/reject')
  async reject(@Headers('x-tenant-id') headerTenantId: string, @Param('proposalId') proposalId: string, @Body() dto: RejectProposalDto, @CurrentUser() user: AuthenticatedUser) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const proposal = await this.responseProposalService.reject({
      tenantId,
      proposalId,
      actorId: user.id,
      reason: dto.reason,
    });
    return { statusCode: HttpStatus.OK, data: proposal };
  }

  @Post('response-proposals/:proposalId/simulate')
  async simulate(@Headers('x-tenant-id') headerTenantId: string, @Param('proposalId') proposalId: string) {
    const simulation = await this.responseProposalService.getSimulation(this.resolveTenantId(headerTenantId), proposalId);
    return { statusCode: simulation.state === 'QUEUED' ? HttpStatus.ACCEPTED : HttpStatus.OK, data: simulation };
  }

  @Post('response/freeze')
  async freezeResponse(@Headers('x-tenant-id') headerTenantId: string, @Body() body: { reason: string }, @CurrentUser() user: AuthenticatedUser) {
    const freeze = await this.responseProposalService.freezeTenant(this.resolveTenantId(headerTenantId), user.id, body.reason);
    return { statusCode: HttpStatus.OK, frozen: true, data: freeze };
  }

  @Post('response/unfreeze')
  async unfreezeResponse(@Headers('x-tenant-id') headerTenantId: string) {
    return { statusCode: HttpStatus.OK, ...(await this.responseProposalService.unfreezeTenant(this.resolveTenantId(headerTenantId))) };
  }

  @Get('response/freeze-status')
  async getFreezeStatus(@Headers('x-tenant-id') headerTenantId: string) {
    return { statusCode: HttpStatus.OK, ...(await this.responseProposalService.getFreezeStatus(this.resolveTenantId(headerTenantId))) };
  }
}
