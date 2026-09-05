import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
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
  scenarioType!: 'RANSOMWARE_STAGING' | 'CREDENTIAL_STUFFING_BURST' | 'CLOUD_IAM_PRIVILEGE_ESCALATION';
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

@UseGuards(InternalAuthGuard)
@Controller()
export class ShieldAiController {
  constructor(
    private readonly threatHuntingService: ThreatHuntingCopilotService,
    private readonly redTeamService: RedTeamScenarioGeneratorService,
    private readonly autonomousRedTeamAgent: AutonomousRedTeamAgentService,
    private readonly rcaService: IncidentRcaGeneratorService,
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

  @Post('api/v1/ai/copilot/hunt')
  async threatHunt(@Body() body: ThreatHuntingQueryDto) {
    return this.threatHuntingService.hunt(body);
  }

  @Post('api/v1/ai/threat-hunting/hunt')
  async threatHuntingHunt(@Body() body: ThreatHuntingQueryDto) {
    return this.threatHuntingService.hunt(body);
  }

  @Post('api/v1/ai/red-team/simulate-scenario')
  simulateRedTeamScenario(@Body() body: RedTeamScenarioDto) {
    return this.redTeamService.generateScenario(body);
  }

  @Post('api/v1/ai/red-team/execute-chain')
  executeRedTeamChain(@Body() body: ExecuteAttackChainDto) {
    return this.autonomousRedTeamAgent.executeChain(body);
  }

  @Post('api/v1/ai/redteam/execute-chain')
  executeRedTeamChainAlias(@Body() body: ExecuteAttackChainDto) {
    return this.autonomousRedTeamAgent.executeChain(body);
  }

  @Post('api/v1/ai/rca/generate')
  generateIncidentRca(@Body() body: IncidentTelemetryDto) {
    return this.rcaService.generateIncidentRca(body);
  }
}
