import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Optional,
} from '@nestjs/common';
import { SimulationService } from './simulation/simulation.service';
import { ActionRollbackBrokerService } from './rollback/action-rollback-broker.service';
import { FreezeControllerService } from './freeze-controller/freeze-controller.service';
import { TwoManRuleService } from './approval/two-man-rule.service';
import { DistributedActionLockService } from './orchestration/distributed-action-lock.service';
import { EbpfNetworkEnforcerService } from './microsegmentation/ebpf-network-enforcer.service';
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

export class ApplyEbpfRuleDto {
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

@UseGuards(InternalAuthGuard)
@Controller()
export class ShieldActionController {
  constructor(
    private readonly simulationService: SimulationService,
    private readonly rollbackBroker: ActionRollbackBrokerService,
    private readonly freezeController: FreezeControllerService,
    private readonly twoManRuleService: TwoManRuleService,
    private readonly distributedLockService: DistributedActionLockService,
    @Optional()
    private readonly ebpfNetworkEnforcer?: EbpfNetworkEnforcerService,
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

  @Post('api/v1/actions/simulate')
  async simulateAction(@Body() body: SimulateActionDto) {
    return this.simulationService.simulate(
      body.tenantId,
      body.proposalId,
      body.correlationId,
    );
  }

  @Post('api/v1/actions/rollback')
  async rollbackAction(@Body() body: RollbackActionDto) {
    return this.rollbackBroker.executeRollback(
      body.tenantId,
      body.rollbackToken,
    );
  }

  @Post('api/v1/actions/freeze')
  async createFreeze(@Body() body: CreateFreezeDto) {
    return this.freezeController.createFreeze(body);
  }

  @Get('api/v1/actions/receipts/:receiptId')
  async getReceipt(
    @Param('receiptId') receiptId: string,
    @Query('tenantId') tenantId: string,
  ) {
    return this.rollbackBroker.getReceipt(tenantId, receiptId);
  }

  // --- Two-Man Rule Dual-Authorization Endpoints ---

  @Post('api/v1/action/approvals/two-man/submit')
  submitTwoManTicket(@Body() body: SubmitTwoManTicketDto) {
    return this.twoManRuleService.submitTicket(body);
  }

  @Post('api/v1/action/approvals/two-man/approve')
  approveTwoManTicket(@Body() body: ApproveTwoManTicketDto) {
    return this.twoManRuleService.approveTicket(body);
  }

  @Post('api/v1/action/approvals/two-man/reject')
  rejectTwoManTicket(@Body() body: RejectTwoManTicketDto) {
    return this.twoManRuleService.rejectTicket(
      body.tenantId,
      body.ticketId,
      body.rejectorId,
      body.rejectionReason,
    );
  }

  @Get('api/v1/action/approvals/two-man/:ticketId')
  getTwoManTicket(
    @Param('ticketId') ticketId: string,
    @Query('tenantId') tenantId: string,
  ) {
    return this.twoManRuleService.getTicket(tenantId, ticketId);
  }

  // --- Distributed Action Lock & Idempotency Endpoints ---

  @Post('api/v1/action/locks/acquire')
  acquireLock(@Body() body: AcquireLockDto) {
    return this.distributedLockService.acquireLock(body);
  }

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

  // --- eBPF Kernel Microsegmentation Endpoints ---

  @Post('api/v1/action/ebpf/rules')
  applyEbpfRule(@Body() body: ApplyEbpfRuleDto) {
    if (!this.ebpfNetworkEnforcer) {
      return {
        status: 'UNAVAILABLE',
        message: 'eBPF Network Enforcer is not configured in this environment',
      };
    }
    return this.ebpfNetworkEnforcer.applyMicrosegmentationRule(body);
  }

  @Post('api/v1/action/ebpf/quarantine')
  quarantinePod(@Body() body: QuarantinePodDto) {
    if (!this.ebpfNetworkEnforcer) {
      return {
        status: 'UNAVAILABLE',
        message: 'eBPF Network Enforcer is not configured in this environment',
      };
    }
    return this.ebpfNetworkEnforcer.quarantinePodNetwork(
      body.tenantId,
      body.podSelector,
    );
  }

  @Get('api/v1/action/ebpf/rules')
  getEbpfRules(@Query('tenantId') tenantId: string) {
    if (!this.ebpfNetworkEnforcer) {
      return [];
    }
    return this.ebpfNetworkEnforcer.getActiveRules(tenantId || 'global');
  }
}
