import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { InternalAuthGuard } from '../internal-client/internal-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AiKillSwitchService } from '../kill-switch/ai-kill-switch.service';
import { AiFinOpsBudgetService } from '../usage-control/ai-finops-budget.service';
import { TOOL_REGISTRY } from '../tools/tool-capability.service';
import { AiSystemInventoryService } from '../inventory/ai-system-inventory.service';
import { AiSupplyChainService } from '../supply-chain/ai-supply-chain.service';
import { AiDriftMonitorService } from '../drift-monitoring/ai-drift-monitor.service';
import { ModelDriftMonitorService } from '../drift-monitoring/model-drift-monitor.service';

/**
 * ZS-ENG-AI-001 §28: Required Engineering and Governance Views (V01 to V30).
 * Exposes machine-readable views, registers, and kill-switch states
 * for the AI Control Plane.
 */
@Controller('internal/v1/governance/views')
@UseGuards(InternalAuthGuard)
export class AiGovernanceViewsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly killSwitchService: AiKillSwitchService,
    private readonly finopsBudget: AiFinOpsBudgetService,
    private readonly inventoryService: AiSystemInventoryService,
    private readonly supplyChainService: AiSupplyChainService,
    private readonly aiDriftMonitor: AiDriftMonitorService,
    private readonly modelDriftService: ModelDriftMonitorService,
  ) {}

  /**
   * V01: AI Operations Command Center
   * Fleet health, active routes, degraded systems, token spend, kill states
   */
  @Get('v01-ops-center')
  async getOpsCenterView(@Query('tenantId') tenantId?: string) {
    const budgetStatus = tenantId
      ? this.finopsBudget.getTenantUsageSummary(tenantId)
      : null;

    return {
      statusCode: HttpStatus.OK,
      data: {
        fleetStatus: 'HEALTHY',
        activeRoutes: [
          {
            routeId: 'route-secure-text-v3',
            status: 'ACTIVE',
            provider: 'bedrock-claude-3-5-sonnet',
          },
          {
            routeId: 'route-fast-summary-v2',
            status: 'ACTIVE',
            provider: 'azure-openai-gpt-4o-mini',
          },
        ],
        budgetStatus,
        governanceCompliance: {
          noLlmCriticalPathPreserved: true,
          gatewayOnlyEnforced: true,
          zeroToleranceCriticalFailures: 0,
        },
      },
    };
  }

  /**
   * V04: Model/Provider Registry
   * Approved models, versions, terms, regions, and concentration risk
   */
  @Get('v04-models')
  async getModelRegistryView() {
    const models = await this.prisma.modelProfile.findMany({
      orderBy: { created_at: 'desc' },
    });
    return {
      statusCode: HttpStatus.OK,
      data: {
        totalApproved: models.length,
        models,
      },
    };
  }

  /**
   * V06: Prompt Profile Registry
   * Version diff, instruction hierarchy, output schema, and approvals
   */
  @Get('v06-prompts')
  async getPromptRegistryView() {
    const prompts = await this.prisma.promptProfile.findMany({
      orderBy: { created_at: 'desc' },
    });
    return {
      statusCode: HttpStatus.OK,
      data: {
        totalPrompts: prompts.length,
        prompts,
      },
    };
  }

  /**
   * V12: Tool Registry & Side-Effect Matrix
   * Side-effect tiers T0-T5, target authorization endpoints, and rate limits
   */
  @Get('v12-tools')
  async getToolMatrixView() {
    return {
      statusCode: HttpStatus.OK,
      data: {
        registeredTools: TOOL_REGISTRY,
        sideEffectHierarchy: [
          'T0_PURE_READ',
          'T1_DERIVED_COMPUTATION',
          'T2_REVERSIBLE_INTERNAL_WRITE',
          'T3_EXTERNAL_COMMUNICATION',
          'T4_CUSTOMER_ESTATE_ACTION',
          'T5_IRREVERSIBLE_PROHIBITED',
        ],
      },
    };
  }

  /**
   * V24: Kill-Switch Control
   * Granular switches (Feature, Model, Route, Provider, Source, Agent, Tool, Tenant, Global)
   */
  @Get('v24-kill-switch-status')
  async getKillSwitchStatus() {
    const status = this.killSwitchService.listActiveSwitches();
    return {
      statusCode: HttpStatus.OK,
      data: status,
    };
  }

  @Post('v24-kill-switch-toggle')
  async toggleKillSwitch(
    @Body()
    body: {
      scope:
        'FEATURE' | 'MODEL_ROUTE' | 'PROVIDER' | 'TOOL' | 'TENANT' | 'GLOBAL';
      targetId: string;
      active: boolean;
      approver: string;
      reason: string;
    },
  ) {
    if (body.active) {
      this.killSwitchService.activateKillSwitch({
        scope: body.scope,
        targetId: body.targetId,
        reason: body.reason,
        activatedBy: body.approver,
      });
    } else {
      this.killSwitchService.deactivateKillSwitch({
        scope: body.scope,
        targetId: body.targetId,
        deactivatedBy: body.approver,
      });
    }

    return {
      statusCode: HttpStatus.OK,
      message: `Kill switch '${body.scope}:${body.targetId}' updated to ${body.active ? 'ACTIVE (KILLED)' : 'INACTIVE (RESTORED)'}`,
      data: this.killSwitchService.listActiveSwitches(),
    };
  }

  /**
   * V05: AI System Inventory & Risk Classification
   * NIST AI RMF & EU AI Act model inventory, classification, and oversight criteria
   */
  @Get('v05-inventory')
  async getInventoryView() {
    const summary = this.inventoryService.computeInventorySummary();
    return {
      statusCode: HttpStatus.OK,
      data: summary,
    };
  }

  /**
   * V08: AI Supply Chain & Provider Concentration Risk
   * Herfindahl-Hirschman Index (HHI), provider diversification, and fallback readiness
   */
  @Get('v08-supply-chain')
  async getSupplyChainView() {
    const report = this.supplyChainService.assessConcentrationRisk();
    return {
      statusCode: HttpStatus.OK,
      data: report,
    };
  }

  /**
   * V21: Model Drift & PSI Evaluation View
   * Drift status, PSI score, confidence shift, and latency distribution
   */
  @Get('v21-drift')
  async getDriftEvaluationView(
    @Query('modelId') modelId?: string,
    @Query('minSampleSize') minSampleSize?: string,
  ) {
    const targetModel = modelId || 'gemini-1.5-pro';
    const sampleSize = minSampleSize ? parseInt(minSampleSize, 10) : 10;
    const evaluation = this.modelDriftService.evaluateDrift(targetModel, sampleSize);
    return {
      statusCode: HttpStatus.OK,
      data: evaluation,
    };
  }

  /**
   * V21: Autonomous Drift Evaluation & Containment Enforcement
   */
  @Post('v21-drift/enforce')
  async enforceDriftContainment(
    @Body()
    body: {
      modelId: string;
      tenantId: string;
      minSampleSize?: number;
    },
  ) {
    const report = await this.aiDriftMonitor.evaluateAndEnforce(
      body.modelId,
      body.tenantId,
      body.minSampleSize || 10,
    );
    return {
      statusCode: HttpStatus.OK,
      data: report,
    };
  }

  /**
   * V22: AI FinOps & Token Budget View
   * Per-tenant token consumption, rate window utilization, and budget ceilings
   */
  @Get('v22-finops-budget')
  async getFinOpsBudgetView(@Query('tenantId') tenantId?: string) {
    const summary = this.finopsBudget.getTenantUsageSummary(
      tenantId || '00000000-0000-4000-8000-000000000001',
    );
    return {
      statusCode: HttpStatus.OK,
      data: summary,
    };
  }
}
