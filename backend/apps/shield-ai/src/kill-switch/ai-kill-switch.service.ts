import { Injectable, Logger } from '@nestjs/common';
import { AiUnavailableException } from '../gateway/fallback/fallback.exceptions';

export type KillSwitchScope =
  | 'GLOBAL'
  | 'TENANT'
  | 'FEATURE'
  | 'PROMPT'
  | 'MODEL_ROUTE'
  | 'PROVIDER'
  | 'AGENT'
  | 'TOOL';

export interface KillSwitchRecord {
  scope: KillSwitchScope;
  targetId: string; // '*' for GLOBAL, or specific ID/key
  reason: string;
  activatedBy: string;
  activatedAt: Date;
  active: boolean;
}

/**
 * ZS-ENG-AI-001 §23: AI Incident Response, Kill Switches and Rollback.
 * Granular emergency freeze mechanism at 7 control layers. Activating any kill switch
 * immediately stops affected AI paths with zero delay and triggers safe degradation to
 * deterministic core services, without affecting tenant security telemetry or evidence.
 */
@Injectable()
export class AiKillSwitchService {
  private readonly logger = new Logger(AiKillSwitchService.name);
  private readonly switches = new Map<string, KillSwitchRecord>();

  private key(scope: KillSwitchScope, targetId: string): string {
    return `${scope}:${targetId}`;
  }

  activateKillSwitch(params: {
    scope: KillSwitchScope;
    targetId: string;
    reason: string;
    activatedBy: string;
  }): KillSwitchRecord {
    const k = this.key(params.scope, params.targetId);
    const record: KillSwitchRecord = {
      scope: params.scope,
      targetId: params.targetId,
      reason: params.reason,
      activatedBy: params.activatedBy,
      activatedAt: new Date(),
      active: true,
    };
    this.switches.set(k, record);
    this.logger.warn(
      `🚨 AI Kill Switch ACTIVATED [Scope: ${params.scope}, Target: ${params.targetId}] by ${params.activatedBy}: ${params.reason}`,
    );
    return record;
  }

  deactivateKillSwitch(params: {
    scope: KillSwitchScope;
    targetId: string;
    deactivatedBy: string;
  }): void {
    const k = this.key(params.scope, params.targetId);
    const record = this.switches.get(k);
    if (record) {
      record.active = false;
      this.switches.delete(k);
      this.logger.log(
        `✔ AI Kill Switch DEACTIVATED [Scope: ${params.scope}, Target: ${params.targetId}] by ${params.deactivatedBy}`,
      );
    }
  }

  isBlocked(context: {
    tenantId: string;
    useCaseKey?: string;
    promptKey?: string;
    modelRoute?: string;
    providerKey?: string;
    agentId?: string;
    toolName?: string;
  }): { blocked: boolean; reason?: string; scope?: KillSwitchScope } {
    // 1. Global Kill Switch
    if (this.switches.has(this.key('GLOBAL', '*'))) {
      const rec = this.switches.get(this.key('GLOBAL', '*'))!;
      return {
        blocked: true,
        reason: `Global AI emergency freeze active: ${rec.reason}`,
        scope: 'GLOBAL',
      };
    }

    // 2. Tenant Kill Switch
    if (this.switches.has(this.key('TENANT', context.tenantId))) {
      const rec = this.switches.get(this.key('TENANT', context.tenantId))!;
      return {
        blocked: true,
        reason: `AI is disabled for tenant '${context.tenantId}': ${rec.reason}`,
        scope: 'TENANT',
      };
    }

    // 3. Feature / Use Case Kill Switch
    if (
      context.useCaseKey &&
      this.switches.has(this.key('FEATURE', context.useCaseKey))
    ) {
      const rec = this.switches.get(this.key('FEATURE', context.useCaseKey))!;
      return {
        blocked: true,
        reason: `AI feature '${context.useCaseKey}' is disabled: ${rec.reason}`,
        scope: 'FEATURE',
      };
    }

    // 4. Prompt Kill Switch
    if (
      context.promptKey &&
      this.switches.has(this.key('PROMPT', context.promptKey))
    ) {
      const rec = this.switches.get(this.key('PROMPT', context.promptKey))!;
      return {
        blocked: true,
        reason: `Prompt profile '${context.promptKey}' is disabled: ${rec.reason}`,
        scope: 'PROMPT',
      };
    }

    // 5. Model Route Kill Switch
    if (
      context.modelRoute &&
      this.switches.has(this.key('MODEL_ROUTE', context.modelRoute))
    ) {
      const rec = this.switches.get(
        this.key('MODEL_ROUTE', context.modelRoute),
      )!;
      return {
        blocked: true,
        reason: `Model route '${context.modelRoute}' is disabled: ${rec.reason}`,
        scope: 'MODEL_ROUTE',
      };
    }

    // 6. Provider Kill Switch
    if (
      context.providerKey &&
      this.switches.has(this.key('PROVIDER', context.providerKey))
    ) {
      const rec = this.switches.get(this.key('PROVIDER', context.providerKey))!;
      return {
        blocked: true,
        reason: `Model provider '${context.providerKey}' is disabled: ${rec.reason}`,
        scope: 'PROVIDER',
      };
    }

    // 7. Agent Kill Switch
    if (
      context.agentId &&
      this.switches.has(this.key('AGENT', context.agentId))
    ) {
      const rec = this.switches.get(this.key('AGENT', context.agentId))!;
      return {
        blocked: true,
        reason: `Agent '${context.agentId}' is frozen: ${rec.reason}`,
        scope: 'AGENT',
      };
    }

    // 8. Tool Kill Switch
    if (
      context.toolName &&
      this.switches.has(this.key('TOOL', context.toolName))
    ) {
      const rec = this.switches.get(this.key('TOOL', context.toolName))!;
      return {
        blocked: true,
        reason: `Tool '${context.toolName}' is disabled: ${rec.reason}`,
        scope: 'TOOL',
      };
    }

    return { blocked: false };
  }

  assertNotBlocked(context: {
    tenantId: string;
    useCaseKey?: string;
    promptKey?: string;
    modelRoute?: string;
    providerKey?: string;
    agentId?: string;
    toolName?: string;
  }): void {
    const check = this.isBlocked(context);
    if (check.blocked) {
      throw new AiUnavailableException(check.reason!);
    }
  }

  listActiveSwitches(): KillSwitchRecord[] {
    return Array.from(this.switches.values());
  }
}
