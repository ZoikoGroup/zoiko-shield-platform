import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { SimulationService } from './simulation/simulation.service';
import { ActionRollbackBrokerService } from './rollback/action-rollback-broker.service';
import { FreezeControllerService } from './freeze-controller/freeze-controller.service';
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

@UseGuards(InternalAuthGuard)
@Controller()
export class ShieldActionController {
  constructor(
    private readonly simulationService: SimulationService,
    private readonly rollbackBroker: ActionRollbackBrokerService,
    private readonly freezeController: FreezeControllerService,
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
}
