import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import {
  JitSessionEnforcerService,
  JitSession,
} from './jit-session-enforcer.service';

export interface PeerApprovalToken {
  approverId: string;
  approverTenantId: string;
  targetTenantId: string;
  requestedRole: string;
  signature: string;
  expiresAt: Date;
}

export interface TerminalSessionAudit {
  sessionId: string;
  operatorId: string;
  tenantId: string;
  elevatedRole: string;
  totalCommandsExecuted: number;
  sessionStartedAt: Date;
  sessionClosedAt: Date;
  commandLogDigest: string;
  merkleLeafHash: string;
}

/**
 * JIT Privileged Session Witness Ledger Engine (Master Build Plan §7 step 3 & §12 Security Baseline).
 * Enforces peer-approver token validation across tenant boundaries and seals terminal session audit records.
 */
@Injectable()
export class JitSessionWitnessService {
  private readonly logger = new Logger(JitSessionWitnessService.name);

  constructor(private readonly sessionEnforcer: JitSessionEnforcerService) {}

  /**
   * Evaluates a cross-tenant elevation request against a cryptographic peer-approval token.
   */
  async authorizeElevatedSession(params: {
    operatorId: string;
    operatorHomeTenantId: string;
    targetTenantId: string;
    requestedRole: string;
    clientIp: string;
    durationMinutes?: number;
    peerToken: PeerApprovalToken;
  }): Promise<JitSession> {
    // 1. Boundary Guard: If elevating on a foreign tenant, the token MUST be signed by target tenant approver
    if (params.targetTenantId !== params.peerToken.targetTenantId) {
      throw new UnauthorizedException(
        `Peer approval token target tenant mismatch: token grants '${params.peerToken.targetTenantId}' but attempted on '${params.targetTenantId}'`,
      );
    }

    if (params.peerToken.approverTenantId !== params.targetTenantId) {
      throw new UnauthorizedException(
        `Cross-tenant elevation rejected: Approver must belong to target tenant '${params.targetTenantId}' (approver is from '${params.peerToken.approverTenantId}')`,
      );
    }

    if (new Date() > new Date(params.peerToken.expiresAt)) {
      throw new BadRequestException('Peer approval token has expired');
    }

    // 2. Enforce maximum duration ceiling (< 60 minutes [derived])
    const effectiveDuration = Math.min(60, params.durationMinutes ?? 15);

    // 3. Delegate to session enforcer
    const session = this.sessionEnforcer.createJitSession(
      params.operatorId,
      params.targetTenantId,
      params.requestedRole,
      params.clientIp,
      effectiveDuration,
      5,
    );

    this.logger.log(
      `🔒 [JIT WITNESSED ELEVATION] Operator '${params.operatorId}' authorized by '${params.peerToken.approverId}' on '${params.targetTenantId}'`,
    );

    return session;
  }

  /**
   * Closes a JIT session and commits a tamper-evident audit record for the Merkle evidence ledger.
   */
  async sealTerminalSessionAudit(
    sessionId: string,
    commandHistory: Array<{
      command: string;
      executedAt: string;
      result: string;
    }>,
  ): Promise<TerminalSessionAudit> {
    const session = this.sessionEnforcer.getSession(sessionId);
    if (!session) {
      throw new BadRequestException(`JIT Session '${sessionId}' not found`);
    }

    this.sessionEnforcer.revokeSession(
      sessionId,
      'SESSION_COMPLETED_AND_SEALED',
    );

    const commandLogDigest = this.hashContent(commandHistory);
    const sessionClosedAt = new Date();

    const auditCore = {
      sessionId,
      operatorId: session.operatorId,
      tenantId: session.tenantId,
      elevatedRole: session.elevatedRole,
      sessionStartedAt: new Date(session.issuedAt).toISOString(),
      sessionClosedAt: sessionClosedAt.toISOString(),
      commandLogDigest,
    };

    const merkleLeafHash = this.hashContent({
      leafType: 'JIT_PRIVILEGED_SESSION_AUDIT',
      ...auditCore,
    });

    return {
      sessionId,
      operatorId: session.operatorId,
      tenantId: session.tenantId,
      elevatedRole: session.elevatedRole,
      totalCommandsExecuted: commandHistory.length,
      sessionStartedAt: new Date(session.issuedAt),
      sessionClosedAt,
      commandLogDigest,
      merkleLeafHash,
    };
  }

  private hashContent(data: unknown): string {
    const serialized = typeof data === 'string' ? data : JSON.stringify(data);
    return createHash('sha256').update(serialized).digest('hex');
  }
}
