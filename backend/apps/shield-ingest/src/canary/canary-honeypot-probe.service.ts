import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export type CanaryType =
  | 'AWS_ACCESS_KEY'
  | 'ENTRA_SERVICE_PRINCIPAL'
  | 'DATABASE_CREDENTIAL'
  | 'HONEY_FILE';

export interface CanaryToken {
  tokenId: string;
  tenantId: string;
  canaryType: CanaryType;
  decoyIdentifier: string;
  deployedEnvironment: string;
  createdAt: string;
  isActive: boolean;
}

export interface HoneypotTriggerAlert {
  alertId: string;
  tenantId: string;
  severity: 'P0_CRITICAL';
  findingType: 'HONEYPOT_SYNTHETIC_TRIPWIRE_TRIGGER';
  canaryToken: CanaryToken;
  attackerContext: {
    sourceIp: string;
    userAgent?: string;
    actionAttempted: string;
    detectedAt: string;
  };
  confidenceScore: 100; // Zero false positive by definition
  recommendedAction: 'ISOLATE_IMMEDIATE_AND_DISABLE_CREDENTIAL';
  tripwireAttestationDigest: string;
}

/**
 * Autonomous Canary Honeypot Synthetic Probes & Tripwire Dispatcher
 * Specification: ZS-SOC-PLAY-001 §7 (High-Fidelity Synthetic Decoys)
 */
@Injectable()
export class CanaryHoneypotProbeService {
  private readonly logger = new Logger(CanaryHoneypotProbeService.name);

  // Deployed Canary Tokens Registry: Map<decoyIdentifier, CanaryToken>
  private readonly activeCanaryRegistry = new Map<string, CanaryToken>();

  /**
   * Provisions a synthetic canary token across enterprise environment.
   */
  deployCanaryToken(req: {
    tenantId: string;
    canaryType: CanaryType;
    decoyIdentifier: string;
    deployedEnvironment: string;
  }): CanaryToken {
    const tokenId = `canary-${crypto.randomUUID().slice(0, 8)}`;
    const token: CanaryToken = {
      tokenId,
      tenantId: req.tenantId,
      canaryType: req.canaryType,
      decoyIdentifier: req.decoyIdentifier,
      deployedEnvironment: req.deployedEnvironment,
      createdAt: new Date().toISOString(),
      isActive: true,
    };

    this.activeCanaryRegistry.set(req.decoyIdentifier.toLowerCase(), token);
    this.logger.log(
      `Deployed Canary Decoy [${token.tokenId}] (${token.canaryType}): ${token.decoyIdentifier}`,
    );
    return token;
  }

  /**
   * Inspects streaming events for interactions with synthetic canary tokens.
   */
  inspectTelemetryForCanaryTripwire(event: {
    tenantId: string;
    accessedIdentifier: string;
    sourceIp: string;
    userAgent?: string;
    actionAttempted: string;
  }): HoneypotTriggerAlert | null {
    const canary = this.activeCanaryRegistry.get(
      event.accessedIdentifier.toLowerCase(),
    );

    if (!canary || !canary.isActive) {
      return null;
    }

    const alertId = `alert-p0-honeypot-${crypto.randomUUID()}`;
    const detectedAt = new Date().toISOString();

    const tripwireAttestationDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify({ alertId, canary, event, detectedAt }))
      .digest('hex');

    this.logger.warn(
      `🚨🚨 [P0 HONEYPOT TRIGGER] Adversary touched Canary Decoy '${canary.decoyIdentifier}' from IP ${event.sourceIp}!`,
    );

    return {
      alertId,
      tenantId: canary.tenantId,
      severity: 'P0_CRITICAL',
      findingType: 'HONEYPOT_SYNTHETIC_TRIPWIRE_TRIGGER',
      canaryToken: canary,
      attackerContext: {
        sourceIp: event.sourceIp,
        userAgent: event.userAgent,
        actionAttempted: event.actionAttempted,
        detectedAt,
      },
      confidenceScore: 100,
      recommendedAction: 'ISOLATE_IMMEDIATE_AND_DISABLE_CREDENTIAL',
      tripwireAttestationDigest,
    };
  }

  /**
   * Lists all active canaries for a tenant.
   */
  getActiveCanaries(tenantId: string): CanaryToken[] {
    return Array.from(this.activeCanaryRegistry.values()).filter(
      (c) => c.tenantId === tenantId,
    );
  }
}
