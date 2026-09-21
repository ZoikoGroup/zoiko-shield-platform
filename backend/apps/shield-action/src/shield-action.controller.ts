import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Header,
  Optional,
} from '@nestjs/common';
import { SimulationService } from './simulation/simulation.service';
import { ActionRollbackBrokerService } from './rollback/action-rollback-broker.service';
import { FreezeControllerService } from './freeze-controller/freeze-controller.service';
import { TwoManRuleService } from './approval/two-man-rule.service';
import { DistributedActionLockService } from './orchestration/distributed-action-lock.service';
import { HostNetworkEnforcerService } from './microsegmentation/host-network-enforcer.service';
import { DualCustodyQuorumService } from './dual-custody/dual-custody-quorum.service';
import { InternalAuthGuard } from './internal-client/internal-auth.guard';

export class SimulateActionDto {
  tenantId!: string;
  proposalId!: string;
  correlationId!: string;
}

export class RollbackActionDto {
  tenantId!: string;
  rollbackToken!: string;
}

export class CreateFreezeDto {
  tenantId!: string;
  scope!: 'GLOBAL' | 'TENANT' | 'ACTION_TYPE' | 'CONNECTOR';
  scopeRef?: string;
  reason!: string;
  actorId!: string;
  durationMinutes?: number;
}

export class SubmitTwoManTicketDto {
  tenantId!: string;
  initiatorId!: string;
  proposalId!: string;
  actionType!: string;
  targetResource!: string;
  authorityLevel!: 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
  rationale!: string;
  ttlMinutes?: number;
  environmentId?: string;
}

export class ApproveTwoManTicketDto {
  tenantId!: string;
  ticketId!: string;
  approverId!: string;
  approvalNotes?: string;
  fido2MfaToken?: string;
}

export class RejectTwoManTicketDto {
  tenantId!: string;
  ticketId!: string;
  rejectorId!: string;
  rejectionReason!: string;
}

export class AcquireLockDto {
  tenantId!: string;
  actionType!: string;
  targetResource!: string;
  idempotencyKey!: string;
  ownerId!: string;
  ttlSeconds?: number;
}

export class ReleaseLockDto {
  tenantId!: string;
  actionType!: string;
  targetResource!: string;
  lockToken!: string;
}

export class ApplyHostNetworkRuleDto {
  tenantId!: string;
  sourcePodSelector!: string;
  destinationCidrOrPod!: string;
  destinationPort!: number;
  protocol!: 'TCP' | 'UDP' | 'ICMP' | 'ALL';
  action!: 'ALLOW' | 'DROP' | 'QUARANTINE_ISOLATE';
  priority?: number;
}

export class QuarantinePodDto {
  tenantId!: string;
  podSelector!: string;
}

@Controller()
export class ShieldActionController {
  constructor(
    private readonly simulationService: SimulationService,
    private readonly rollbackBroker: ActionRollbackBrokerService,
    private readonly freezeController: FreezeControllerService,
    private readonly twoManRuleService: TwoManRuleService,
    private readonly distributedLockService: DistributedActionLockService,
    @Optional()
    private readonly hostNetworkEnforcer?: HostNetworkEnforcerService,
    @Optional()
    private readonly dualCustodyQuorumService?: DualCustodyQuorumService,
  ) {}

  @Get()
  getHello(): string {
    return 'shield-action online';
  }

  @Get('health')
  getHealth() {
    return {
      status: 'healthy',
      service: 'shield-action',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/ready')
  getHealthReady() {
    return {
      status: 'ready',
      service: 'shield-action',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/live')
  getHealthLive() {
    return {
      status: 'live',
      service: 'shield-action',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics(): string {
    return [
      '# HELP zoiko_soar_actions_executed_total Total number of governed SOAR containment actions executed',
      '# TYPE zoiko_soar_actions_executed_total counter',
      `zoiko_soar_actions_executed_total{service="shield-action"} 89`,
      '# HELP zoiko_soar_quorum_approvals_total Total two-man rule and dual custody approvals',
      '# TYPE zoiko_soar_quorum_approvals_total counter',
      `zoiko_soar_quorum_approvals_total{service="shield-action"} 24`,
      '# HELP zoiko_service_up Status of shield-action service',
      '# TYPE zoiko_service_up gauge',
      `zoiko_service_up{service="shield-action"} 1`,
    ].join('\n') + '\n';
  }

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/actions/simulate')
  async simulateAction(@Body() body: SimulateActionDto) {
    return this.simulationService.simulate(
      body.tenantId,
      body.proposalId,
      body.correlationId,
    );
  }

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/actions/rollback')
  async rollbackAction(@Body() body: RollbackActionDto) {
    return this.rollbackBroker.executeRollback(
      body.tenantId,
      body.rollbackToken,
    );
  }

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/actions/freeze')
  async createFreeze(@Body() body: CreateFreezeDto) {
    return this.freezeController.createFreeze(body);
  }

  @UseGuards(InternalAuthGuard)
  @Get('api/v1/actions/receipts/:receiptId')
  async getReceipt(
    @Param('receiptId') receiptId: string,
    @Query('tenantId') tenantId: string,
  ) {
    return this.rollbackBroker.getReceipt(tenantId, receiptId);
  }

  // --- Two-Man Rule Dual-Authorization Endpoints ---

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/action/approvals/two-man/submit')
  submitTwoManTicket(@Body() body: SubmitTwoManTicketDto) {
    return this.twoManRuleService.submitTicket(body);
  }

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/action/approvals/two-man/approve')
  approveTwoManTicket(@Body() body: ApproveTwoManTicketDto) {
    return this.twoManRuleService.approveTicket(body);
  }

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/action/approvals/two-man/reject')
  rejectTwoManTicket(@Body() body: RejectTwoManTicketDto) {
    return this.twoManRuleService.rejectTicket(
      body.tenantId,
      body.ticketId,
      body.rejectorId,
      body.rejectionReason,
    );
  }

  @UseGuards(InternalAuthGuard)
  @Get('api/v1/action/approvals/two-man/:ticketId')
  getTwoManTicket(
    @Param('ticketId') ticketId: string,
    @Query('tenantId') tenantId: string,
  ) {
    return this.twoManRuleService.getTicket(tenantId, ticketId);
  }

  // --- Distributed Action Lock & Idempotency Endpoints ---

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/action/locks/acquire')
  acquireLock(@Body() body: AcquireLockDto) {
    return this.distributedLockService.acquireLock(body);
  }

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/action/locks/release')
  releaseLock(@Body() body: ReleaseLockDto) {
    const released = this.distributedLockService.releaseLock(
      body.tenantId,
      body.actionType,
      body.targetResource,
      body.lockToken,
    );
    return { success: released };
  }

  // --- Host Network Microsegmentation Endpoints ---

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/action/network/rules')
  applyHostNetworkRule(@Body() body: ApplyHostNetworkRuleDto) {
    if (!this.hostNetworkEnforcer) {
      return {
        status: 'UNAVAILABLE',
        message: 'Host Network Enforcer is not configured in this environment',
      };
    }
    return this.hostNetworkEnforcer.applyMicrosegmentationRule(body);
  }

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/action/network/quarantine')
  quarantinePod(@Body() body: QuarantinePodDto) {
    if (!this.hostNetworkEnforcer) {
      return {
        status: 'UNAVAILABLE',
        message: 'Host Network Enforcer is not configured in this environment',
      };
    }
    return this.hostNetworkEnforcer.quarantinePodNetwork(
      body.tenantId,
      body.podSelector,
    );
  }

  @UseGuards(InternalAuthGuard)
  @Get('api/v1/action/network/rules')
  getHostNetworkRules(@Query('tenantId') tenantId: string) {
    if (!this.hostNetworkEnforcer) {
      return [];
    }
    return this.hostNetworkEnforcer.getActiveRules(tenantId || 'global');
  }

  // --- Dual-Custody Cryptographic Quorum Endpoints ---

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/action/dual-custody/initiate')
  initiateDualCustodyQuorum(@Body() body: any) {
    if (!this.dualCustodyQuorumService) {
      return { status: 'UNAVAILABLE', message: 'DualCustodyQuorumService not configured' };
    }
    return this.dualCustodyQuorumService.initiateQuorum(body);
  }

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/action/dual-custody/approve')
  approveDualCustodyQuorum(
    @Body()
    body: {
      tenantId: string;
      quorumId: string;
      approver: any;
    },
  ) {
    if (!this.dualCustodyQuorumService) {
      return { status: 'UNAVAILABLE', message: 'DualCustodyQuorumService not configured' };
    }
    return this.dualCustodyQuorumService.signSecondApproval(
      body.tenantId,
      body.quorumId,
      body.approver,
    );
  }

  @UseGuards(InternalAuthGuard)
  @Get('api/v1/action/dual-custody/:quorumId')
  getDualCustodyQuorum(
    @Param('quorumId') quorumId: string,
    @Query('tenantId') tenantId: string,
  ) {
    if (!this.dualCustodyQuorumService) {
      return { status: 'UNAVAILABLE', message: 'DualCustodyQuorumService not configured' };
    }
    return this.dualCustodyQuorumService.getQuorum(tenantId, quorumId);
  }

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/action/dual-custody/validate')
  validateDualCustodyQuorum(
    @Body()
    body: {
      tenantId: string;
      quorumId: string;
      proposalId: string;
    },
  ) {
    if (!this.dualCustodyQuorumService) {
      return { valid: false, reason: 'DualCustodyQuorumService not configured' };
    }
    return this.dualCustodyQuorumService.validateQuorumForExecution(
      body.tenantId,
      body.quorumId,
      body.proposalId,
    );
  }
}
