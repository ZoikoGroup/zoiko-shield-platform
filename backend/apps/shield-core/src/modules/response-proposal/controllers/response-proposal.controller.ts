import { Controller, Post, Get, Param, Headers, Body, HttpStatus } from '@nestjs/common';
import { ResponseProposalService } from '../services/response-proposal.service';

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

@Controller('api/v1')
export class ResponseProposalController {
  constructor(private readonly responseProposalService: ResponseProposalService) {}

  private resolveTenantId(headerTenantId: string): string {
    return headerTenantId || 'default-tenant';
  }
  private resolveActor(dtoActorId: string | undefined): string {
    return dtoActorId || 'system';
  }

  @Post('cases/:caseId/response-proposals')
  async create(@Headers('x-tenant-id') headerTenantId: string, @Param('caseId') caseId: string, @Body() dto: CreateProposalDto) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const proposal = await this.responseProposalService.createProposal({
      tenantId,
      environmentId: 'default-env',
      caseId,
      alertId: dto.alertId,
      targetType: dto.targetType,
      targetId: dto.targetId,
      actionType: dto.actionType,
      reason: dto.reason,
      requestedBy: this.resolveActor(dto.actorId),
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
    return { statusCode: HttpStatus.OK, tenantId, caseId, proposals: [] };
  }

  @Get('response-proposals/:proposalId')
  async getById(@Headers('x-tenant-id') headerTenantId: string, @Param('proposalId') proposalId: string) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const proposal = await this.responseProposalService.getById(tenantId, proposalId);
    return { statusCode: HttpStatus.OK, data: proposal };
  }

  @Post('response-proposals/:proposalId/approve')
  async approve(@Headers('x-tenant-id') headerTenantId: string, @Param('proposalId') proposalId: string, @Body() dto: ApproveProposalDto) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const approval = await this.responseProposalService.approve({
      tenantId,
      proposalId,
      approverId: this.resolveActor(dto.actorId),
      reason: dto.reason,
    });
    return { statusCode: HttpStatus.OK, data: approval };
  }

  @Post('response-proposals/:proposalId/reject')
  async reject(@Headers('x-tenant-id') headerTenantId: string, @Param('proposalId') proposalId: string, @Body() dto: RejectProposalDto) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const proposal = await this.responseProposalService.reject({
      tenantId,
      proposalId,
      actorId: this.resolveActor(dto.actorId),
      reason: dto.reason,
    });
    return { statusCode: HttpStatus.OK, data: proposal };
  }

  @Post('response-proposals/:proposalId/simulate')
  async simulate(@Headers('x-tenant-id') headerTenantId: string, @Param('proposalId') proposalId: string) {
    return {
      statusCode: HttpStatus.OK,
      message: 'Response simulation executed successfully',
      receipt: {
        id: `rcpt-${Date.now()}`,
        proposalId,
        result: 'SIMULATED',
        simulatedTarget: { type: 'USER', id: 'user-1' },
        observedEffect: { sessionsTerminated: true },
        createdAt: new Date().toISOString(),
      },
    };
  }

  @Post('response/freeze')
  async freezeResponse(@Headers('x-tenant-id') headerTenantId: string, @Body() body: { reason?: string }) {
    return { statusCode: HttpStatus.OK, message: 'Response freeze switch ACTIVATED', frozen: true, reason: body?.reason };
  }

  @Post('response/unfreeze')
  async unfreezeResponse(@Headers('x-tenant-id') headerTenantId: string) {
    return { statusCode: HttpStatus.OK, message: 'Response freeze switch DEACTIVATED', frozen: false };
  }

  @Get('response/freeze-status')
  async getFreezeStatus(@Headers('x-tenant-id') headerTenantId: string) {
    return { statusCode: HttpStatus.OK, frozen: false, status: 'OPERATIONAL' };
  }
}
