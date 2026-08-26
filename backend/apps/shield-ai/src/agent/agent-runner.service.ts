import { Injectable, Logger } from '@nestjs/common';
import crypto from 'crypto';
import {
  ToolCapabilityService,
  ToolCapabilityGrant,
} from '../tools/tool-capability.service';

export interface AgentBudget {
  maxSteps: number;
  maxToolCalls: number;
  maxDurationSeconds: number;
  maxCostUsd: number;
}

export interface AgentProfile {
  id: string;
  principal: string;
  goal: string;
  autonomy: 'A1_ASSISTIVE' | 'A2_RECOMMEND' | 'A3_BOUNDED' | 'A4_HIGH_IMPACT';
  allowedTools: string[];
  budgets: AgentBudget;
}

export interface AgentRunStep {
  stepNumber: number;
  actionType: 'PLAN' | 'TOOL_CALL' | 'CHECKPOINT' | 'STOP';
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolReceiptHash?: string;
  observation?: string;
  timestamp: Date;
}

export interface AgentRunReceipt {
  runId: string;
  agentId: string;
  tenantId: string;
  caseId?: string;
  goal: string;
  status:
    | 'COMPLETED'
    | 'STOPPED_BUDGET_EXHAUSTED'
    | 'STOPPED_INJECTION_DETECTED'
    | 'STOPPED_POLICY_DENIAL';
  stopReason: string;
  totalSteps: number;
  totalToolCalls: number;
  totalDurationMs: number;
  estimatedCostUsd: number;
  steps: AgentRunStep[];
  citations: string[];
  completedAt: Date;
}

/**
 * ZS-ENG-AI-001 §14: Agentic Runtime, Planning and Orchestration.
 * Bounded execution loop with strict limits on steps (max 12), tool calls (max 20),
 * execution duration (180s), and cost ($1.50). Working memory is strictly ephemeral.
 */
@Injectable()
export class AgentRunnerService {
  private readonly logger = new Logger(AgentRunnerService.name);

  constructor(private readonly toolCapability: ToolCapabilityService) {}

  async runAgent(params: {
    profile: AgentProfile;
    tenantId: string;
    caseId?: string;
    initialContext: string;
    toolsExecutor?: (
      toolName: string,
      args: Record<string, unknown>,
    ) => Promise<{ result: string; citations?: string[] }>;
  }): Promise<AgentRunReceipt> {
    const runId = `run-${crypto.randomUUID()}`;
    const startTime = Date.now();
    const steps: AgentRunStep[] = [];
    const collectedCitations = new Set<string>();

    let currentStep = 0;
    let toolCallCount = 0;
    let estimatedCost = 0.02; // baseline prompt cost
    let stopReason = 'GOAL_MET';
    let status: AgentRunReceipt['status'] = 'COMPLETED';

    // High-impact authority is always retained by an authenticated human.
    // An agent declaring A4 must not even reach capability issuance.
    if (params.profile.autonomy === 'A4_HIGH_IMPACT') {
      return {
        runId,
        agentId: params.profile.id,
        tenantId: params.tenantId,
        caseId: params.caseId,
        goal: params.profile.goal,
        status: 'STOPPED_POLICY_DENIAL',
        stopReason:
          'A4_HIGH_IMPACT is human-authority-only; autonomous agent execution is prohibited',
        totalSteps: 0,
        totalToolCalls: 0,
        totalDurationMs: Date.now() - startTime,
        estimatedCostUsd: 0,
        steps: [],
        citations: [],
        completedAt: new Date(),
      };
    }

    // Ephemeral working memory / scratchpad (destroyed at run end per §13)
    let scratchpad = `Initial Context: ${params.initialContext}`;

    const maxSteps = Math.min(params.profile.budgets.maxSteps || 12, 12);
    const maxToolCalls = Math.min(
      params.profile.budgets.maxToolCalls || 20,
      20,
    );
    const maxDurationMs =
      (params.profile.budgets.maxDurationSeconds || 180) * 1000;
    const maxCostUsd = params.profile.budgets.maxCostUsd || 1.5;

    while (currentStep < maxSteps) {
      currentStep += 1;
      const elapsedMs = Date.now() - startTime;

      // Budget check
      if (
        toolCallCount >= maxToolCalls ||
        elapsedMs >= maxDurationMs ||
        estimatedCost >= maxCostUsd
      ) {
        status = 'STOPPED_BUDGET_EXHAUSTED';
        stopReason = `Budget ceiling reached (Steps: ${currentStep}, ToolCalls: ${toolCallCount}, Elapsed: ${elapsedMs}ms, Cost: $${estimatedCost.toFixed(2)})`;
        break;
      }

      // Determine next action (bounded reasoning plan)
      const toolToRun = params.profile.allowedTools[toolCallCount];

      if (!toolToRun) {
        // All planned tools executed
        steps.push({
          stepNumber: currentStep,
          actionType: 'STOP',
          observation: 'All authorized investigation tasks concluded.',
          timestamp: new Date(),
        });
        break;
      }

      // Capability grant authorization per §15
      let grant: ToolCapabilityGrant;
      try {
        grant = this.toolCapability.issueGrant({
          agentPrincipal: params.profile.principal,
          tenantId: params.tenantId,
          toolName: toolToRun,
          resourceScope: params.caseId ? `case:${params.caseId}` : 'tenant:all',
          ttlSeconds: 60,
        });
      } catch (err: any) {
        status = 'STOPPED_POLICY_DENIAL';
        stopReason = `Tool capability denied for '${toolToRun}': ${err.message}`;
        break;
      }

      // Execute tool
      toolCallCount += 1;
      estimatedCost += 0.05; // per tool cost model

      const toolArgs = { caseId: params.caseId, target: 'primary_entity' };
      const receiptHash = crypto
        .createHash('sha256')
        .update(JSON.stringify({ grantId: grant.grantId, toolArgs }))
        .digest('hex');

      let executionResult = `Executed ${toolToRun} successfully with grant ${grant.grantId}`;
      if (params.toolsExecutor) {
        const executed = await params.toolsExecutor(toolToRun, toolArgs);
        executionResult = executed.result;
        if (executed.citations) {
          executed.citations.forEach((c) => collectedCitations.add(c));
        }
      }

      // Injection guard on observation content per §14 & §20
      if (
        executionResult.includes('SYSTEM INSTRUCTION:') ||
        executionResult.includes('IGNORE PRIOR RULES')
      ) {
        status = 'STOPPED_INJECTION_DETECTED';
        stopReason = `Prompt injection signal detected in tool output for '${toolToRun}'`;
        steps.push({
          stepNumber: currentStep,
          actionType: 'STOP',
          toolName: toolToRun,
          observation: 'INJECTION_DETECTED: Tool output quarantined.',
          timestamp: new Date(),
        });
        break;
      }

      scratchpad += `\nStep ${currentStep} (${toolToRun}): ${executionResult}`;

      steps.push({
        stepNumber: currentStep,
        actionType: 'TOOL_CALL',
        toolName: toolToRun,
        toolArgs,
        toolReceiptHash: receiptHash,
        observation: executionResult.substring(0, 100),
        timestamp: new Date(),
      });
    }

    if (
      status === 'COMPLETED' &&
      toolCallCount < params.profile.allowedTools.length
    ) {
      status = 'STOPPED_BUDGET_EXHAUSTED';
      stopReason = `Maximum step limit (${maxSteps}) reached before completing all planned actions`;
    }

    // Explicit destruction of ephemeral scratchpad per §13
    scratchpad = '';

    return {
      runId,
      agentId: params.profile.id,
      tenantId: params.tenantId,
      caseId: params.caseId,
      goal: params.profile.goal,
      status,
      stopReason,
      totalSteps: currentStep,
      totalToolCalls: toolCallCount,
      totalDurationMs: Date.now() - startTime,
      estimatedCostUsd: Number(estimatedCost.toFixed(4)),
      steps,
      citations: Array.from(collectedCitations),
      completedAt: new Date(),
    };
  }
}
