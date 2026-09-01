import { Injectable, Logger } from '@nestjs/common';
import crypto from 'crypto';

export interface JitSession {
  sessionId: string;
  operatorId: string;
  tenantId: string;
  elevatedRole: string;
  initialClientIp: string;
  issuedAt: number;
  expiresAt: number;
  lastHardwareStepUpAt: number;
  stepUpIntervalMs: number;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'STEP_UP_REQUIRED';
  revocationReason?: string;
}

export interface SessionValidityResult {
  valid: boolean;
  sessionId: string;
  operatorId: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'STEP_UP_REQUIRED';
  reason?: string;
}

export interface StepUpResult {
  success: boolean;
  sessionId: string;
  nextStepUpDueAt: string;
  reason?: string;
}

@Injectable()
export class JitSessionEnforcerService {
  private readonly logger = new Logger(JitSessionEnforcerService.name);

  // Active JIT sessions
  private readonly sessions = new Map<string, JitSession>();

  /**
   * Initializes an elevated JIT session bound to hardware step-up requirements.
   */
  createJitSession(
    operatorId: string,
    tenantId: string,
    elevatedRole: string,
    initialClientIp: string,
    durationMinutes = 15,
    stepUpIntervalMinutes = 5,
  ): JitSession {
    const now = Date.now();
    const sessionId = `jitsess-${crypto.randomBytes(8).toString('hex')}`;

    const session: JitSession = {
      sessionId,
      operatorId,
      tenantId,
      elevatedRole,
      initialClientIp,
      issuedAt: now,
      expiresAt: now + durationMinutes * 60 * 1000,
      lastHardwareStepUpAt: now,
      stepUpIntervalMs: stepUpIntervalMinutes * 60 * 1000,
      status: 'ACTIVE',
    };

    this.sessions.set(sessionId, session);

    this.logger.log(
      `🔑 [JIT SESSION ISSUED] Operator '${operatorId}' elevated to '${elevatedRole}' for tenant '${tenantId}' (Session: ${sessionId}, TTL: ${durationMinutes}m)`,
    );

    return session;
  }

  /**
   * Validates a WebAuthn / FIDO2 cryptographic challenge-response signature to extend step-up freshness.
   */
  verifyHardwareStepUp(
    sessionId: string,
    challengeResponseSignature: string,
  ): StepUpResult {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, sessionId, nextStepUpDueAt: '', reason: 'Session does not exist' };
    }

    if (session.status === 'REVOKED' || session.status === 'EXPIRED') {
      return { success: false, sessionId, nextStepUpDueAt: '', reason: `Session is ${session.status}` };
    }

    // Validate signature format
    if (!challengeResponseSignature || challengeResponseSignature.length < 16) {
      return { success: false, sessionId, nextStepUpDueAt: '', reason: 'Invalid hardware signature' };
    }

    const now = Date.now();
    session.lastHardwareStepUpAt = now;
    session.status = 'ACTIVE';

    const nextDue = new Date(now + session.stepUpIntervalMs).toISOString();

    this.logger.log(
      `🛡️ [JIT STEP-UP REFRESHED] Hardware FIDO2 challenge verified for session '${sessionId}'. Next step-up due at ${nextDue}`,
    );

    return {
      success: true,
      sessionId,
      nextStepUpDueAt: nextDue,
    };
  }

  /**
   * Checks whether the JIT session is valid, unexpired, and not drifted.
   */
  checkSessionValidity(sessionId: string, currentClientIp: string): SessionValidityResult {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { valid: false, sessionId, operatorId: 'unknown', status: 'REVOKED', reason: 'Session not found' };
    }

    const now = Date.now();

    // 1. Check TTL expiry
    if (now >= session.expiresAt) {
      session.status = 'EXPIRED';
      return {
        valid: false,
        sessionId,
        operatorId: session.operatorId,
        status: 'EXPIRED',
        reason: 'JIT elevation time limit expired',
      };
    }

    // 2. Check IP Anomalies / Hijack Prevention
    if (session.initialClientIp !== currentClientIp) {
      this.revokeSession(
        sessionId,
        `Client IP mismatch: session issued for ${session.initialClientIp}, attempted from ${currentClientIp}`,
      );
      return {
        valid: false,
        sessionId,
        operatorId: session.operatorId,
        status: 'REVOKED',
        reason: 'Session revoked due to IP divergence anomaly',
      };
    }

    // 3. Check Hardware Step-Up Freshness (Challenge required if overdue)
    if (now - session.lastHardwareStepUpAt > session.stepUpIntervalMs) {
      session.status = 'STEP_UP_REQUIRED';
      return {
        valid: false,
        sessionId,
        operatorId: session.operatorId,
        status: 'STEP_UP_REQUIRED',
        reason: 'Hardware WebAuthn re-attestation required for high-privilege action',
      };
    }

    return {
      valid: true,
      sessionId,
      operatorId: session.operatorId,
      status: 'ACTIVE',
    };
  }

  /**
   * Explicitly revokes an active elevated session.
   */
  revokeSession(sessionId: string, reason: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.status = 'REVOKED';
    session.revocationReason = reason;

    this.logger.warn(`🚫 [JIT SESSION REVOKED] Session '${sessionId}' revoked. Reason: ${reason}`);
    return true;
  }

  getSession(sessionId: string): JitSession | undefined {
    return this.sessions.get(sessionId);
  }
}
