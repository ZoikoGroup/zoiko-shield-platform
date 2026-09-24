import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';

export type FreezeScope =
  'GLOBAL' | 'REGIONAL' | 'TENANT' | 'CONNECTOR' | 'ACTION_TYPE';

export interface ActiveFreezeRecord {
  freezeId: string;
  scope: FreezeScope;
  tenantId?: string;
  region?: string;
  scopeRef?: string;
  reason: string;
  initiatedBy: string;
  activeFrom: string;
  activeUntil?: string;
  requiresDualCustodyUnfreeze: boolean;
  unfreezeApprovals: string[]; // list of approver IDs
  immutableRefusalDigest: string;
}

export interface FreezeCheckParams {
  tenantId: string;
  actionType: string;
  region?: string;
  connectorKey?: string;
}

export interface FreezeCheckResult {
  frozen: boolean;
  reason?: string;
  freezeId?: string;
  scope?: FreezeScope;
  refusalDigest?: string;
}

@Injectable()
export class EmergencyFreezeLockdownService {
  private readonly logger = new Logger(EmergencyFreezeLockdownService.name);
  private activeFreezes: Map<string, ActiveFreezeRecord> = new Map();

  /**
   * Engages an emergency lockdown freeze across one of 5 supported scopes (ZS-ENG-DRS-001 §19.4).
   */
  engageFreeze(input: {
    scope: FreezeScope;
    tenantId?: string;
    region?: string;
    scopeRef?: string;
    reason: string;
    initiatedBy: string;
    durationMinutes?: number;
  }): ActiveFreezeRecord {
    const freezeId = `frz-${crypto.randomUUID()}`;
    const now = new Date();
    const activeUntil = input.durationMinutes
      ? new Date(
          now.getTime() + input.durationMinutes * 60 * 1000,
        ).toISOString()
      : undefined;

    // High impact scopes (GLOBAL, REGIONAL) require dual-custody approval to release
    const requiresDualCustodyUnfreeze =
      input.scope === 'GLOBAL' || input.scope === 'REGIONAL';

    const refusalDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          freezeId,
          scope: input.scope,
          tenantId: input.tenantId,
          region: input.region,
          scopeRef: input.scopeRef,
          reason: input.reason,
          initiatedBy: input.initiatedBy,
          activeFrom: now.toISOString(),
        }),
      )
      .digest('hex');

    const record: ActiveFreezeRecord = {
      freezeId,
      scope: input.scope,
      tenantId: input.tenantId,
      region: input.region,
      scopeRef: input.scopeRef,
      reason: input.reason,
      initiatedBy: input.initiatedBy,
      activeFrom: now.toISOString(),
      activeUntil,
      requiresDualCustodyUnfreeze,
      unfreezeApprovals: [],
      immutableRefusalDigest: refusalDigest,
    };

    this.activeFreezes.set(freezeId, record);
    this.logger.warn(
      `🚨 [EMERGENCY FREEZE ENGAGED] Scope: ${input.scope} (Ref: ${input.scopeRef || input.region || input.tenantId || 'GLOBAL'}) | Reason: ${input.reason} by ${input.initiatedBy}`,
    );

    return record;
  }

  /**
   * Submits an approval to release a freeze. If dual custody is required, needs 2 distinct approvers.
   */
  approveUnfreeze(
    freezeId: string,
    approverId: string,
  ): { released: boolean; message: string } {
    const freeze = this.activeFreezes.get(freezeId);
    if (!freeze) {
      return {
        released: false,
        message: `Freeze '${freezeId}' not found or already released.`,
      };
    }

    if (
      freeze.initiatedBy === approverId &&
      freeze.requiresDualCustodyUnfreeze
    ) {
      throw new ForbiddenException(
        `Dual-custody violation: Initiator '${approverId}' cannot be the sole unfreeze approver for ${freeze.scope} freeze.`,
      );
    }

    if (!freeze.unfreezeApprovals.includes(approverId)) {
      freeze.unfreezeApprovals.push(approverId);
    }

    const requiredSignatures = freeze.requiresDualCustodyUnfreeze ? 2 : 1;

    if (freeze.unfreezeApprovals.length >= requiredSignatures) {
      this.activeFreezes.delete(freezeId);
      this.logger.log(
        `✔ [FREEZE RELEASED] Freeze ID ${freezeId} (${freeze.scope}) successfully released with ${freeze.unfreezeApprovals.length} approval(s).`,
      );
      return {
        released: true,
        message: `Freeze '${freezeId}' has been fully released.`,
      };
    }

    return {
      released: false,
      message: `Unfreeze signature recorded (${freeze.unfreezeApprovals.length}/${requiredSignatures} required). Awaiting secondary approval.`,
    };
  }

  /**
   * Directly releases a freeze if not requiring dual custody.
   */
  releaseFreeze(freezeId: string, releasedBy: string): boolean {
    const res = this.approveUnfreeze(freezeId, releasedBy);
    return res.released;
  }

  /**
   * Queries freeze status without throwing an exception.
   */
  checkFreezeStatus(params: FreezeCheckParams): FreezeCheckResult {
    const now = new Date();

    for (const freeze of this.activeFreezes.values()) {
      if (freeze.activeUntil && new Date(freeze.activeUntil) <= now) {
        continue;
      }

      // 1. GLOBAL Scope
      if (freeze.scope === 'GLOBAL') {
        return {
          frozen: true,
          reason: `Action blocked by GLOBAL EMERGENCY FREEZE (${freeze.freezeId}): ${freeze.reason}`,
          freezeId: freeze.freezeId,
          scope: freeze.scope,
          refusalDigest: freeze.immutableRefusalDigest,
        };
      }

      // 2. REGIONAL Scope
      if (
        freeze.scope === 'REGIONAL' &&
        freeze.region &&
        params.region &&
        freeze.region.toLowerCase() === params.region.toLowerCase()
      ) {
        return {
          frozen: true,
          reason: `Action blocked by REGIONAL CELL FREEZE for region '${params.region}' (${freeze.freezeId}): ${freeze.reason}`,
          freezeId: freeze.freezeId,
          scope: freeze.scope,
          refusalDigest: freeze.immutableRefusalDigest,
        };
      }

      // 3. TENANT Scope
      if (freeze.scope === 'TENANT' && freeze.tenantId === params.tenantId) {
        return {
          frozen: true,
          reason: `Action blocked by TENANT LOCKDOWN (${freeze.freezeId}): ${freeze.reason}`,
          freezeId: freeze.freezeId,
          scope: freeze.scope,
          refusalDigest: freeze.immutableRefusalDigest,
        };
      }

      // 4. ACTION_TYPE Scope
      if (
        freeze.scope === 'ACTION_TYPE' &&
        freeze.scopeRef === params.actionType &&
        (!freeze.tenantId || freeze.tenantId === params.tenantId)
      ) {
        return {
          frozen: true,
          reason: `Action blocked by ACTION_TYPE FREEZE for '${params.actionType}': ${freeze.reason}`,
          freezeId: freeze.freezeId,
          scope: freeze.scope,
          refusalDigest: freeze.immutableRefusalDigest,
        };
      }

      // 5. CONNECTOR Scope
      if (
        freeze.scope === 'CONNECTOR' &&
        freeze.scopeRef === params.connectorKey &&
        (!freeze.tenantId || freeze.tenantId === params.tenantId)
      ) {
        return {
          frozen: true,
          reason: `Action blocked by CONNECTOR FREEZE for '${params.connectorKey}': ${freeze.reason}`,
          freezeId: freeze.freezeId,
          scope: freeze.scope,
          refusalDigest: freeze.immutableRefusalDigest,
        };
      }
    }

    return { frozen: false };
  }

  /**
   * Asserts action is not frozen. Throws ForbiddenException if any matching freeze is active.
   */
  assertNotFrozen(params: FreezeCheckParams): void {
    const status = this.checkFreezeStatus(params);
    if (status.frozen) {
      throw new ForbiddenException(status.reason);
    }
  }

  getActiveFreezes(): ActiveFreezeRecord[] {
    const now = new Date();
    return Array.from(this.activeFreezes.values()).filter(
      (f) => !f.activeUntil || new Date(f.activeUntil) > now,
    );
  }
}
