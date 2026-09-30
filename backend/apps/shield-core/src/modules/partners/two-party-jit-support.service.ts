import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';

export interface TwoPartyJitSession {
  sessionId: string;
  targetTenantId: string;
  requestedByPlatformEngineer: string;
  customerAdminSigner?: string;
  platformLeadSigner?: string;
  customerAdminSignature?: string;
  platformLeadSignature?: string;
  incidentReference: string;
  justification: string;
  allowedScope:
    | 'READ_ONLY_SECURITY_TELEMETRY'
    | 'READ_ONLY_AUDIT_LOGS'
    | 'READ_ONLY_INCIDENT_CONTEXT';
  durationMinutes: number;
  status:
    | 'PENDING_CUSTOMER_APPROVAL'
    | 'PENDING_PLATFORM_APPROVAL'
    | 'ACTIVE_AUTHORIZED'
    | 'EXPIRED'
    | 'REVOKED';
  ephemeralAccessToken?: string;
  createdAt: string;
  activatedAt?: string;
  expiresAt?: string;
}

@Injectable()
export class TwoPartyJitSupportService {
  private readonly logger = new Logger(TwoPartyJitSupportService.name);
  private readonly sessions = new Map<string, TwoPartyJitSession>();

  /**
   * Step 1: Platform engineer initiates a two-party JIT support access request for a customer tenant.
   */
  initiateSupportRequest(
    targetTenantId: string,
    platformEngineerId: string,
    incidentReference: string,
    justification: string,
    allowedScope:
      | 'READ_ONLY_SECURITY_TELEMETRY'
      | 'READ_ONLY_AUDIT_LOGS'
      | 'READ_ONLY_INCIDENT_CONTEXT' = 'READ_ONLY_SECURITY_TELEMETRY',
    durationMinutes = 60,
  ): TwoPartyJitSession {
    if (!targetTenantId || !incidentReference || !justification) {
      throw new BadRequestException(
        'Target tenant, incident reference, and justification are mandatory.',
      );
    }

    const sessionId = `jit-2p-${randomUUID()}`;
    const session: TwoPartyJitSession = {
      sessionId,
      targetTenantId,
      requestedByPlatformEngineer: platformEngineerId,
      incidentReference,
      justification,
      allowedScope,
      durationMinutes,
      status: 'PENDING_CUSTOMER_APPROVAL',
      createdAt: new Date().toISOString(),
    };

    this.sessions.set(sessionId, session);

    this.logger.log(
      `[TWO_PARTY_JIT_INITIATED] Session '${sessionId}' initiated for Tenant '${targetTenantId}' by Engineer '${platformEngineerId}'`,
    );

    return session;
  }

  /**
   * Step 2: Customer Tenant Administrator signs and approves the support session.
   */
  approveByCustomerAdmin(
    sessionId: string,
    customerAdminId: string,
    signatureProof: string,
  ): TwoPartyJitSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`JIT Session '${sessionId}' not found.`);
    }

    if (session.status !== 'PENDING_CUSTOMER_APPROVAL') {
      throw new BadRequestException(
        `Cannot approve session in '${session.status}' status.`,
      );
    }

    session.customerAdminSigner = customerAdminId;
    session.customerAdminSignature =
      signatureProof ||
      createHash('sha256')
        .update(`customer:${customerAdminId}:${sessionId}`)
        .digest('hex');
    session.status = 'PENDING_PLATFORM_APPROVAL';

    this.logger.log(
      `[TWO_PARTY_JIT_CUSTOMER_APPROVED] Session '${sessionId}' signed by Customer Admin '${customerAdminId}'`,
    );

    return session;
  }

  /**
   * Step 3: Platform Lead / CISO signs and authorizes final token issuance.
   */
  authorizeByPlatformLead(
    sessionId: string,
    platformLeadId: string,
    signatureProof: string,
  ): TwoPartyJitSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`JIT Session '${sessionId}' not found.`);
    }

    if (session.status !== 'PENDING_PLATFORM_APPROVAL') {
      throw new BadRequestException(
        `Customer Admin approval is required before Platform Lead sign-off.`,
      );
    }

    const now = new Date();
    const expires = new Date(
      now.getTime() + session.durationMinutes * 60 * 1000,
    );

    session.platformLeadSigner = platformLeadId;
    session.platformLeadSignature =
      signatureProof ||
      createHash('sha256')
        .update(`lead:${platformLeadId}:${sessionId}`)
        .digest('hex');
    session.status = 'ACTIVE_AUTHORIZED';
    session.activatedAt = now.toISOString();
    session.expiresAt = expires.toISOString();

    // Generate ephemeral read-only token
    session.ephemeralAccessToken = `jit_token_${createHash('sha256').update(`${sessionId}:${session.targetTenantId}:${now.toISOString()}`).digest('hex')}`;

    this.logger.log(
      `[TWO_PARTY_JIT_ACTIVATED] Session '${sessionId}' activated for Tenant '${session.targetTenantId}'. Expires: ${session.expiresAt}`,
    );

    return session;
  }

  /**
   * Revokes an active JIT session immediately.
   */
  revokeSession(sessionId: string, reason: string): TwoPartyJitSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`JIT Session '${sessionId}' not found.`);
    }

    session.status = 'REVOKED';
    session.ephemeralAccessToken = undefined;

    this.logger.warn(
      `[TWO_PARTY_JIT_REVOKED] Session '${sessionId}' revoked. Reason: ${reason}`,
    );

    return session;
  }

  getSession(sessionId: string): TwoPartyJitSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`JIT Session '${sessionId}' not found.`);
    }
    return session;
  }

  listSessionsForTenant(tenantId: string): TwoPartyJitSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.targetTenantId === tenantId,
    );
  }
}
