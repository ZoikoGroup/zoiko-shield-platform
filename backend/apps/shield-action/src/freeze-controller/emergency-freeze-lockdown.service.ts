import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';

export type FreezeScope = 'GLOBAL' | 'TENANT' | 'CONNECTOR' | 'ACTION_TYPE';

export interface ActiveFreezeRecord {
  freezeId: string;
  scope: FreezeScope;
  tenantId?: string;
  scopeRef?: string;
  reason: string;
  initiatedBy: string;
  activeFrom: string;
  activeUntil?: string;
  immutableRefusalDigest: string;
}

@Injectable()
export class EmergencyFreezeLockdownService {
  private readonly logger = new Logger(EmergencyFreezeLockdownService.name);
  private activeFreezes: Map<string, ActiveFreezeRecord> = new Map();

  /**
   * Engages an emergency lockdown freeze.
   */
  engageFreeze(input: {
    scope: FreezeScope;
    tenantId?: string;
    scopeRef?: string;
    reason: string;
    initiatedBy: string;
    durationMinutes?: number;
  }): ActiveFreezeRecord {
    const freezeId = `frz-${crypto.randomUUID()}`;
    const now = new Date();
    const activeUntil = input.durationMinutes
      ? new Date(now.getTime() + input.durationMinutes * 60 * 1000).toISOString()
      : undefined;

    const refusalDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify({ ...input, freezeId, activeFrom: now.toISOString() }))
      .digest('hex');

    const record: ActiveFreezeRecord = {
      freezeId,
      scope: input.scope,
      tenantId: input.tenantId,
      scopeRef: input.scopeRef,
      reason: input.reason,
      initiatedBy: input.initiatedBy,
      activeFrom: now.toISOString(),
      activeUntil,
      immutableRefusalDigest: refusalDigest,
    };

    this.activeFreezes.set(freezeId, record);
    this.logger.warn(
      `🚨 [EMERGENCY FREEZE ENGAGED] Scope: ${input.scope} (Ref: ${input.scopeRef || 'ALL'}) | Reason: ${input.reason} by ${input.initiatedBy}`,
    );

    return record;
  }

  /**
   * Releases an active freeze.
   */
  releaseFreeze(freezeId: string, releasedBy: string): boolean {
    if (!this.activeFreezes.has(freezeId)) return false;
    this.activeFreezes.delete(freezeId);
    this.logger.log(`✔ [FREEZE RELEASED] Freeze ID ${freezeId} released by ${releasedBy}`);
    return true;
  }

  /**
   * Checks if an action is frozen. If frozen, logs refusal and throws ForbiddenException.
   */
  assertNotFrozen(params: {
    tenantId: string;
    actionType: string;
    connectorKey?: string;
  }): void {
    const now = new Date();
    for (const freeze of this.activeFreezes.values()) {
      if (freeze.activeUntil && new Date(freeze.activeUntil) <= now) {
        // Expired
        continue;
      }

      if (freeze.scope === 'GLOBAL') {
        throw new ForbiddenException(
          `Action execution blocked by GLOBAL EMERGENCY FREEZE (${freeze.freezeId}): ${freeze.reason}`,
        );
      }

      if (freeze.scope === 'TENANT' && freeze.tenantId === params.tenantId) {
        throw new ForbiddenException(
          `Action execution blocked by TENANT LOCKDOWN (${freeze.freezeId}): ${freeze.reason}`,
        );
      }

      if (
        freeze.scope === 'ACTION_TYPE' &&
        freeze.scopeRef === params.actionType &&
        (!freeze.tenantId || freeze.tenantId === params.tenantId)
      ) {
        throw new ForbiddenException(
          `Action execution blocked by ACTION_TYPE FREEZE for '${params.actionType}': ${freeze.reason}`,
        );
      }

      if (
        freeze.scope === 'CONNECTOR' &&
        freeze.scopeRef === params.connectorKey &&
        (!freeze.tenantId || freeze.tenantId === params.tenantId)
      ) {
        throw new ForbiddenException(
          `Action execution blocked by CONNECTOR FREEZE for '${params.connectorKey}': ${freeze.reason}`,
        );
      }
    }
  }

  getActiveFreezes(): ActiveFreezeRecord[] {
    return Array.from(this.activeFreezes.values());
  }
}
