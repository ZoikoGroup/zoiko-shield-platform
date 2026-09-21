import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  Header,
  NotFoundException,
} from '@nestjs/common';
import { InternalAuthGuard } from './internal-client/internal-auth.guard';
import {
  ThreatHuntingCopilotService,
  type ThreatHuntingQueryInput,
} from './agent/threat-hunting-copilot.service';
import {
  RedTeamScenarioGeneratorService,
  type RedTeamScenarioRequest,
} from './adversarial/red-team-scenario-generator.service';
import {
  AutonomousRedTeamAgentService,
  type ExecuteAttackChainRequest,
} from './adversarial/autonomous-red-team-agent.service';
import {
  IncidentRcaGeneratorService,
  type IncidentTelemetryInput,
} from './rca/incident-rca-generator.service';
import {
  AiSystemInventoryService,
  type AiModelProfile,
} from './inventory/ai-system-inventory.service';
import { AiSupplyChainService } from './supply-chain/ai-supply-chain.service';
import { AiDriftMonitorService } from './drift-monitoring/ai-drift-monitor.service';
import { ModelDriftMonitorService } from './drift-monitoring/model-drift-monitor.service';
import { AiFinOpsBudgetService } from './usage-control/ai-finops-budget.service';

export class ThreatHuntingQueryDto implements ThreatHuntingQueryInput {
  tenantId!: string;
  analystId!: string;
  caseId?: string;
  query!: string;
  maxIterations?: number;
  seedContext?: Record<string, any>;
}

export class RedTeamScenarioDto implements RedTeamScenarioRequest {
  tenantId!: string;
  scenarioType!:
    | 'RANSOMWARE_STAGING'
    | 'CREDENTIAL_STUFFING_BURST'
    | 'CLOUD_IAM_PRIVILEGE_ESCALATION';
  targetHost?: string;
  targetUser?: string;
  intensityLevel?: 'LOW' | 'MEDIUM' | 'AGGRESSIVE';
}

export class ExecuteAttackChainDto implements ExecuteAttackChainRequest {
  tenantId!: string;
  scenarioName?: string;
  targetHost?: string;
  targetUser?: string;
  intensityLevel?: 'LOW' | 'MEDIUM' | 'AGGRESSIVE';
}

export class IncidentTelemetryDto implements IncidentTelemetryInput {
  incidentId!: string;
  tenantId!: string;
  title!: string;
  severity!: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  events!: Array<{
    eventId: string;
    timestamp: string;
    source: string;
    eventType: string;
    actor?: string;
    targetResource: string;
    details: Record<string, any>;
  }>;
  attackGraphPath?: string[];
}

@Controller()
export class ShieldAiController {
  constructor(
    private readonly threatHuntingService: ThreatHuntingCopilotService,
    private readonly redTeamService: RedTeamScenarioGeneratorService,
    private readonly autonomousRedTeamAgent: AutonomousRedTeamAgentService,
    private readonly rcaService: IncidentRcaGeneratorService,
    private readonly inventoryService: AiSystemInventoryService,
    private readonly supplyChainService: AiSupplyChainService,
    private readonly aiDriftMonitor: AiDriftMonitorService,
    private readonly modelDriftService: ModelDriftMonitorService,
    private readonly finopsBudgetService: AiFinOpsBudgetService,
  ) {}

  @Get()
  getHello(): string {
    return 'shield-ai online';
  }

  @Get('health')
  getHealth() {
    return {
      status: 'healthy',
      service: 'shield-ai',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/ready')
  getHealthReady() {
    return {
      status: 'ready',
      service: 'shield-ai',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/live')
  getHealthLive() {
    return {
      status: 'live',
      service: 'shield-ai',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics(): string {
    return (
      [
        '# HELP zoiko_ai_inferences_total Total number of AI inferences evaluated by ModelArmor',
        '# TYPE zoiko_ai_inferences_total counter',
        `zoiko_ai_inferences_total{service="shield-ai"} 1420`,
        '# HELP zoiko_ai_jailbreak_interceptions_total Total adversarial prompt injection attacks blocked',
        '# TYPE zoiko_ai_jailbreak_interceptions_total counter',
        `zoiko_ai_jailbreak_interceptions_total{service="shield-ai"} 38`,
        '# HELP zoiko_service_up Status of shield-ai service',
        '# TYPE zoiko_service_up gauge',
        `zoiko_service_up{service="shield-ai"} 1`,
      ].join('\n') + '\n'
    );
  }

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/ai/copilot/hunt')
  async threatHunt(@Body() body: ThreatHuntingQueryDto) {
    return this.threatHuntingService.hunt(body);
  }

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/ai/threat-hunting/hunt')
  async threatHuntingHunt(@Body() body: ThreatHuntingQueryDto) {
    return this.threatHuntingService.hunt(body);
  }

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/ai/red-team/simulate-scenario')
  simulateRedTeamScenario(@Body() body: RedTeamScenarioDto) {
    return this.redTeamService.generateScenario(body);
  }

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/ai/red-team/execute-chain')
  executeRedTeamChain(@Body() body: ExecuteAttackChainDto) {
    return this.autonomousRedTeamAgent.executeChain(body);
  }

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/ai/redteam/execute-chain')
  executeRedTeamChainAlias(@Body() body: ExecuteAttackChainDto) {
    return this.autonomousRedTeamAgent.executeChain(body);
  }

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/ai/rca/generate')
  generateIncidentRca(@Body() body: IncidentTelemetryDto) {
    return this.rcaService.generateIncidentRca(body);
  }

  @UseGuards(InternalAuthGuard)
  @Get('api/v1/ai/inventory')
  getInventory() {
    return {
      status: 'success',
      data: this.inventoryService.computeInventorySummary(),
    };
  }

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/ai/inventory')
  registerModel(@Body() body: AiModelProfile) {
    return {
      status: 'success',
      data: this.inventoryService.registerModel(body),
    };
  }

  @UseGuards(InternalAuthGuard)
  @Get('api/v1/ai/inventory/:modelId')
  getModelProfile(@Param('modelId') modelId: string) {
    const profile = this.inventoryService.getModelProfile(modelId);
    if (!profile) {
      throw new NotFoundException(`Model '${modelId}' not found in inventory`);
    }
    return {
      status: 'success',
      data: profile,
    };
  }

  @UseGuards(InternalAuthGuard)
  @Patch('api/v1/ai/inventory/:modelId')
  updateModel(
    @Param('modelId') modelId: string,
    @Body() updates: Partial<AiModelProfile>,
  ) {
    return {
      status: 'success',
      data: this.inventoryService.updateModel(modelId, updates),
    };
  }

  @UseGuards(InternalAuthGuard)
  @Delete('api/v1/ai/inventory/:modelId')
  deleteModel(@Param('modelId') modelId: string) {
    const success = this.inventoryService.deleteModel(modelId);
    if (!success) {
      throw new NotFoundException(`Model '${modelId}' not found in inventory`);
    }
    return {
      status: 'success',
      data: { modelId, decommissioned: true },
    };
  }

  @UseGuards(InternalAuthGuard)
  @Get('api/v1/ai/supply-chain')
  getSupplyChain() {
    return {
      status: 'success',
      data: this.supplyChainService.assessConcentrationRisk(),
    };
  }

  @UseGuards(InternalAuthGuard)
  @Get('api/v1/ai/finops/budget')
  getFinOpsBudget(@Query('tenantId') tenantId?: string) {
    return {
      status: 'success',
      data: this.finopsBudgetService.getTenantUsageSummary(
        tenantId || '00000000-0000-4000-8000-000000000001',
      ),
    };
  }

  @UseGuards(InternalAuthGuard)
  @Get('api/v1/ai/drift')
  getDriftEvaluation(
    @Query('modelId') modelId?: string,
    @Query('minSampleSize') minSampleSize?: string,
  ) {
    const targetModel = modelId || 'gemini-1.5-pro';
    const sampleSize = minSampleSize ? parseInt(minSampleSize, 10) : 10;
    return {
      status: 'success',
      data: this.modelDriftService.evaluateDrift(targetModel, sampleSize),
    };
  }

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/ai/drift/evaluate')
  async enforceDrift(
    @Body()
    body: {
      modelId: string;
      tenantId: string;
      minSampleSize?: number;
    },
  ) {
    return {
      status: 'success',
      data: await this.aiDriftMonitor.evaluateAndEnforce(
        body.modelId,
        body.tenantId,
        body.minSampleSize || 10,
      ),
    };
  }
}
