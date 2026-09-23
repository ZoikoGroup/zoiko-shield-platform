import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';

export type JitSessionStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'REVOKED';

export class JitElevationSession {
  sessionId!: string;
  operatorId!: string;
  operatorName?: string;
  targetTenantId!: string;
  elevatedRole!: string;
  status!: JitSessionStatus;
  clientIp!: string;
  statedPurpose!: string;
  durationMinutes!: number;
  issuedAt!: string;
  expiresAt!: string;
  hardwareStepUpVerified!: boolean;
  hardwareProofDigest?: string;
  peerApprover?: string;
  peerApproverRole?: string;
  approvedAt?: string;
  revocationReason?: string;
  revokedAt?: string;
  revokedBy?: string;
  auditAttestationHash!: string;
}

export class CreateJitElevationDto {
  operatorId!: string;
  operatorName?: string;
  targetTenantId!: string;
  elevatedRole!: string;
  statedPurpose!: string;
  durationMinutes?: number;
  clientIp?: string;
  initialHardwareProof?: string;
}

export class PeerApproveDto {
  approverId!: string;
  approverRole!: string;
  approvalNotes?: string;
}

export class HardwareStepUpDto {
  hardwareProofDigest!: string;
  authenticatorAttachment?: 'PLATFORM' | 'CROSS_PLATFORM';
}

export class RevokeJitSessionDto {
  revokedBy!: string;
  reason!: string;
}

@Injectable()
export class JitElevationService {
  private readonly logger = new Logger(JitElevationService.name);
  private sessions: Map<string, JitElevationSession> = new Map();

  constructor() {
    this.seedReferenceSessions();
  }

  private seedReferenceSessions() {
    const now = new Date();
    const activeExpiry = new Date(now.getTime() + 90 * 60 * 1000).toISOString();
    const session1: JitElevationSession = {
      sessionId: 'jit-sess-1001',
      operatorId: 'usr-analyst-01',
      operatorName: 'Alex Rivera (Tier 2 SecOps)',
      targetTenantId: 'tenant-finance-prod',
      elevatedRole: 'INCIDENT_COMMANDER',
      status: 'ACTIVE',
      clientIp: '192.168.1.104',
      statedPurpose: 'Emergency P1 Containment for Swift Transaction Anomaly (Case #2026-882)',
      durationMinutes: 120,
      issuedAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
      expiresAt: activeExpiry,
      hardwareStepUpVerified: true,
      hardwareProofDigest: crypto.createHash('sha256').update('fido2-yubikey-cert-p256-verified-01').digest('hex'),
      peerApprover: 'usr-ciso-02',
      peerApproverRole: 'CISO',
      approvedAt: new Date(now.getTime() - 28 * 60 * 1000).toISOString(),
      auditAttestationHash: crypto.createHash('sha256').update('jit-sess-1001-active').digest('hex'),
    };

    const session2: JitElevationSession = {
      sessionId: 'jit-sess-1002',
      operatorId: 'usr-sre-03',
      operatorName: 'David Chen (Site Reliability Lead)',
      targetTenantId: 'tenant-telecom-core',
      elevatedRole: 'SUPER_ADMIN',
      status: 'PENDING',
      clientIp: '10.200.4.12',
      statedPurpose: 'Post-Quantum Merkle Epoch Re-synchronization & HSM Key Rotation',
      durationMinutes: 60,
      issuedAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
      expiresAt: new Date(now.getTime() + 50 * 60 * 1000).toISOString(),
      hardwareStepUpVerified: false,
      auditAttestationHash: crypto.createHash('sha256').update('jit-sess-1002-pending').digest('hex'),
    };

    this.sessions.set(session1.sessionId, session1);
    this.sessions.set(session2.sessionId, session2);
  }

  createElevationRequest(dto: CreateJitElevationDto): JitElevationSession {
    if (!dto.operatorId || !dto.targetTenantId || !dto.elevatedRole) {
      throw new BadRequestException('Operator ID, Target Tenant ID, and Elevated Role are mandatory');
    }

    if (!dto.statedPurpose || dto.statedPurpose.trim().length < 10) {
      throw new BadRequestException('Stated purpose must be a comprehensive justification (min 10 characters)');
    }

    const duration = Math.min(Math.max(dto.durationMinutes || 60, 15), 240); // 15 mins to 4 hours
    const now = new Date();
    const expiresAt = new Date(now.getTime() + duration * 60 * 1000).toISOString();
    const sessionId = `jit-sess-${crypto.randomUUID().slice(0, 8)}`;

    const hardwareVerified = !!dto.initialHardwareProof;
    const initialStatus: JitSessionStatus = 'PENDING';

    const session: JitElevationSession = {
      sessionId,
      operatorId: dto.operatorId,
      operatorName: dto.operatorName || dto.operatorId,
      targetTenantId: dto.targetTenantId,
      elevatedRole: dto.elevatedRole,
      status: initialStatus,
      clientIp: dto.clientIp || '127.0.0.1',
      statedPurpose: dto.statedPurpose.trim(),
      durationMinutes: duration,
      issuedAt: now.toISOString(),
      expiresAt,
      hardwareStepUpVerified: hardwareVerified,
      hardwareProofDigest: dto.initialHardwareProof
        ? crypto.createHash('sha256').update(dto.initialHardwareProof).digest('hex')
        : undefined,
      auditAttestationHash: '',
    };

    session.auditAttestationHash = this.computeAuditHash(session);
    this.sessions.set(sessionId, session);

    this.logger.log(`[JIT-ELEVATION] Created pending elevation request ${sessionId} for operator ${dto.operatorId} (${dto.elevatedRole})`);
    return session;
  }

  peerApprove(sessionId: string, dto: PeerApproveDto): JitElevationSession {
    const session = this.findSessionOrThrow(sessionId);
    this.reconcileSessionExpiry(session);

    if (session.status !== 'PENDING') {
      throw new BadRequestException(`Cannot approve session in '${session.status}' status (must be PENDING)`);
    }

    // Strict Separation of Duties (Four-Eyes Principle / Dual-Custody)
    if (session.operatorId === dto.approverId) {
      this.logger.warn(`[JIT-ELEVATION-VIOLATION] Operator ${dto.approverId} attempted to self-approve elevation ${sessionId}`);
      throw new ForbiddenException('Separation of duties violation: Operator cannot approve their own elevation request');
    }

    const now = new Date().toISOString();
    session.peerApprover = dto.approverId;
    session.peerApproverRole = dto.approverRole;
    session.approvedAt = now;

    // If hardware step-up is already verified, transition immediately to ACTIVE
    if (session.hardwareStepUpVerified) {
      session.status = 'ACTIVE';
    } else {
      session.status = 'APPROVED';
    }

    session.auditAttestationHash = this.computeAuditHash(session);
    this.sessions.set(sessionId, session);

    this.logger.log(`[JIT-ELEVATION] Session ${sessionId} approved by peer ${dto.approverId} (${dto.approverRole}) -> ${session.status}`);
    return session;
  }

  stepUpHardware(sessionId: string, dto: HardwareStepUpDto): JitElevationSession {
    const session = this.findSessionOrThrow(sessionId);
    this.reconcileSessionExpiry(session);

    if (session.status === 'EXPIRED' || session.status === 'REVOKED') {
      throw new BadRequestException(`Cannot perform hardware step-up on ${session.status} session`);
    }

    if (!dto.hardwareProofDigest) {
      throw new BadRequestException('Hardware proof digest is required for FIDO2/WebAuthn step-up');
    }

    session.hardwareStepUpVerified = true;
    session.hardwareProofDigest = dto.hardwareProofDigest;

    // If already peer-approved, transition to ACTIVE
    if (session.status === 'APPROVED' || session.peerApprover) {
      session.status = 'ACTIVE';
    }

    session.auditAttestationHash = this.computeAuditHash(session);
    this.sessions.set(sessionId, session);

    this.logger.log(`[JIT-ELEVATION] Session ${sessionId} hardware step-up verified -> Status: ${session.status}`);
    return session;
  }

  revokeSession(sessionId: string, dto: RevokeJitSessionDto): JitElevationSession {
    const session = this.findSessionOrThrow(sessionId);

    if (session.status === 'REVOKED') {
      return session;
    }

    const now = new Date().toISOString();
    session.status = 'REVOKED';
    session.revokedBy = dto.revokedBy;
    session.revocationReason = dto.reason || 'Emergency administrative revocation';
    session.revokedAt = now;

    session.auditAttestationHash = this.computeAuditHash(session);
    this.sessions.set(sessionId, session);

    this.logger.warn(`[JIT-ELEVATION-REVOKED] Session ${sessionId} revoked by ${dto.revokedBy}: ${dto.reason}`);
    return session;
  }

  getSessions(tenantId?: string): JitElevationSession[] {
    const now = new Date();
    const result: JitElevationSession[] = [];

    for (const session of this.sessions.values()) {
      this.reconcileSessionExpiry(session, now);
      if (!tenantId || session.targetTenantId === tenantId) {
        result.push({ ...session });
      }
    }

    return result.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
  }

  getSession(sessionId: string): JitElevationSession {
    const session = this.findSessionOrThrow(sessionId);
    this.reconcileSessionExpiry(session);
    return { ...session };
  }

  private findSessionOrThrow(sessionId: string): JitElevationSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`JIT Elevation Session '${sessionId}' not found`);
    }
    return session;
  }

  private reconcileSessionExpiry(session: JitElevationSession, now = new Date()) {
    if (session.status === 'ACTIVE' || session.status === 'APPROVED' || session.status === 'PENDING') {
      const expiry = new Date(session.expiresAt).getTime();
      if (now.getTime() >= expiry) {
        session.status = 'EXPIRED';
        session.auditAttestationHash = this.computeAuditHash(session);
      }
    }
  }

  private computeAuditHash(session: JitElevationSession): string {
    const payload = {
      sessionId: session.sessionId,
      operatorId: session.operatorId,
      targetTenantId: session.targetTenantId,
      elevatedRole: session.elevatedRole,
      status: session.status,
      issuedAt: session.issuedAt,
      expiresAt: session.expiresAt,
      peerApprover: session.peerApprover,
      hardwareProofDigest: session.hardwareProofDigest,
      revokedAt: session.revokedAt,
    };
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
}
