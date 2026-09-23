import { Test, TestingModule } from '@nestjs/testing';
import { JitElevationService } from './jit-elevation.service';
import { JitElevationController } from './jit-elevation.controller';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('ZS-ENG-AUTH-001 §13: JIT Privileged Access Elevation & Hardware Step-Up Suite', () => {
  let service: JitElevationService;
  let controller: JitElevationController;

  beforeEach(() => {
    service = new JitElevationService();
    controller = new JitElevationController(service);
  });

  describe('1. Elevation Request Creation & Input Validation', () => {
    it('creates a pending elevation request with valid TTL and computed SHA-256 audit hash', () => {
      const session = service.createElevationRequest({
        operatorId: 'usr-analyst-99',
        operatorName: 'Sam Vance',
        targetTenantId: 'tenant-enterprise-alpha',
        elevatedRole: 'SUPER_ADMIN',
        statedPurpose: 'Emergency P1 Remediation for compromised API credentials',
        durationMinutes: 90,
        clientIp: '10.0.50.2',
      });

      expect(session).toBeDefined();
      expect(session.sessionId).toMatch(/^jit-sess-/);
      expect(session.status).toBe('PENDING');
      expect(session.operatorId).toBe('usr-analyst-99');
      expect(session.targetTenantId).toBe('tenant-enterprise-alpha');
      expect(session.elevatedRole).toBe('SUPER_ADMIN');
      expect(session.durationMinutes).toBe(90);
      expect(session.hardwareStepUpVerified).toBe(false);
      expect(session.auditAttestationHash).toBeDefined();
      expect(session.auditAttestationHash.length).toBe(64); // SHA-256 hex length
    });

    it('clamps duration between minimum 15 minutes and maximum 240 minutes (4 hours)', () => {
      const minSession = service.createElevationRequest({
        operatorId: 'usr-1',
        targetTenantId: 'tenant-1',
        elevatedRole: 'INCIDENT_COMMANDER',
        statedPurpose: 'Valid justification with more than 10 characters',
        durationMinutes: 5, // Below 15
      });
      expect(minSession.durationMinutes).toBe(15);

      const maxSession = service.createElevationRequest({
        operatorId: 'usr-2',
        targetTenantId: 'tenant-1',
        elevatedRole: 'INCIDENT_COMMANDER',
        statedPurpose: 'Valid justification with more than 10 characters',
        durationMinutes: 500, // Above 240
      });
      expect(maxSession.durationMinutes).toBe(240);
    });

    it('rejects requests with missing required fields or trivial justifications', () => {
      expect(() => {
        service.createElevationRequest({
          operatorId: '',
          targetTenantId: 'tenant-1',
          elevatedRole: 'SUPER_ADMIN',
          statedPurpose: 'Valid justification text',
        });
      }).toThrow(BadRequestException);

      expect(() => {
        service.createElevationRequest({
          operatorId: 'usr-1',
          targetTenantId: 'tenant-1',
          elevatedRole: 'SUPER_ADMIN',
          statedPurpose: 'too short', // < 10 chars
        });
      }).toThrow(BadRequestException);
    });
  });

  describe('2. Separation of Duties & Dual-Approver Peer Quorum', () => {
    it('STRICTLY REJECTS operator self-approval with ForbiddenException (Four-Eyes Principle)', () => {
      const session = service.createElevationRequest({
        operatorId: 'usr-analyst-42',
        targetTenantId: 'tenant-core',
        elevatedRole: 'SUPER_ADMIN',
        statedPurpose: 'Production database schema inspection for incident #440',
      });

      expect(() => {
        service.peerApprove(session.sessionId, {
          approverId: 'usr-analyst-42', // Same as operator!
          approverRole: 'SUPER_ADMIN',
          approvalNotes: 'Self approving my own request',
        });
      }).toThrow(ForbiddenException);
    });

    it('allows an eligible peer approver to approve a pending session', () => {
      const session = service.createElevationRequest({
        operatorId: 'usr-analyst-42',
        targetTenantId: 'tenant-core',
        elevatedRole: 'SUPER_ADMIN',
        statedPurpose: 'Production database schema inspection for incident #440',
      });

      const approved = service.peerApprove(session.sessionId, {
        approverId: 'usr-ciso-01',
        approverRole: 'CISO',
        approvalNotes: 'Verified ticket INC-440 justification',
      });

      expect(approved.status).toBe('APPROVED');
      expect(approved.peerApprover).toBe('usr-ciso-01');
      expect(approved.peerApproverRole).toBe('CISO');
      expect(approved.approvedAt).toBeDefined();
    });

    it('rejects approval on already approved or revoked sessions', () => {
      const session = service.createElevationRequest({
        operatorId: 'usr-analyst-42',
        targetTenantId: 'tenant-core',
        elevatedRole: 'SUPER_ADMIN',
        statedPurpose: 'Production database schema inspection for incident #440',
      });

      service.peerApprove(session.sessionId, {
        approverId: 'usr-ciso-01',
        approverRole: 'CISO',
      });

      expect(() => {
        service.peerApprove(session.sessionId, {
          approverId: 'usr-dpo-02',
          approverRole: 'DPO',
        });
      }).toThrow(BadRequestException);
    });
  });

  describe('3. Hardware Step-Up Attestation & Activation Lifecycle', () => {
    it('transitions session to ACTIVE once peer approved AND hardware step-up is verified', () => {
      const session = service.createElevationRequest({
        operatorId: 'usr-sec-10',
        targetTenantId: 'tenant-sovereign',
        elevatedRole: 'INCIDENT_COMMANDER',
        statedPurpose: 'Hardware key activation for sovereign cell infrastructure inspection',
      });

      // Step 1: Peer approval
      const afterApproval = service.peerApprove(session.sessionId, {
        approverId: 'usr-vp-eng',
        approverRole: 'VP_ENGINEERING',
      });
      expect(afterApproval.status).toBe('APPROVED');

      // Step 2: FIDO2 / WebAuthn Hardware Step-Up
      const activated = service.stepUpHardware(session.sessionId, {
        hardwareProofDigest: 'fido2-attestation-p256-proof-digest-abc123456',
        authenticatorAttachment: 'CROSS_PLATFORM',
      });

      expect(activated.status).toBe('ACTIVE');
      expect(activated.hardwareStepUpVerified).toBe(true);
      expect(activated.hardwareProofDigest).toBe('fido2-attestation-p256-proof-digest-abc123456');
    });

    it('transitions immediately to ACTIVE if initial hardware proof was provided during creation and peer approves', () => {
      const session = service.createElevationRequest({
        operatorId: 'usr-sec-10',
        targetTenantId: 'tenant-sovereign',
        elevatedRole: 'INCIDENT_COMMANDER',
        statedPurpose: 'Hardware key activation for sovereign cell infrastructure inspection',
        initialHardwareProof: 'hardware-dongle-fido2-signature-raw-token',
      });

      expect(session.hardwareStepUpVerified).toBe(true);
      expect(session.status).toBe('PENDING');

      const activated = service.peerApprove(session.sessionId, {
        approverId: 'usr-ciso-01',
        approverRole: 'CISO',
      });

      expect(activated.status).toBe('ACTIVE');
    });
  });

  describe('4. Emergency Revocation & Expiration Accounting', () => {
    it('immediately terminates and revokes active session with recorded attribution', () => {
      const session = service.createElevationRequest({
        operatorId: 'usr-temp-1',
        targetTenantId: 'tenant-demo',
        elevatedRole: 'SUPER_ADMIN',
        statedPurpose: 'Short emergency review for client audit',
      });

      service.peerApprove(session.sessionId, {
        approverId: 'usr-soc-lead',
        approverRole: 'SOC_LEAD',
      });

      const revoked = service.revokeSession(session.sessionId, {
        revokedBy: 'usr-ciso-master',
        reason: 'Operator task completed ahead of schedule; zero-trust purge',
      });

      expect(revoked.status).toBe('REVOKED');
      expect(revoked.revokedBy).toBe('usr-ciso-master');
      expect(revoked.revocationReason).toContain('Operator task completed');
      expect(revoked.revokedAt).toBeDefined();
    });

    it('automatically transitions past sessions to EXPIRED on listing', () => {
      const session = service.createElevationRequest({
        operatorId: 'usr-expired-test',
        targetTenantId: 'tenant-demo',
        elevatedRole: 'SUPER_ADMIN',
        statedPurpose: 'Test session expiry reconciliation',
        durationMinutes: 15,
      });

      // Manually backdate expiration date
      const sessionObj = service.getSession(session.sessionId);
      (service as any).sessions.get(session.sessionId).expiresAt = new Date(Date.now() - 5000).toISOString();

      const retrieved = service.getSession(session.sessionId);
      expect(retrieved.status).toBe('EXPIRED');
    });
  });

  describe('5. REST Controller Endpoints', () => {
    it('exposes full JIT session lifecycle via HTTP controller', () => {
      const list = controller.getSessions();
      expect(list).toBeDefined();
      expect(list.total).toBeGreaterThanOrEqual(2); // Initial seeded reference sessions

      const single = controller.getSession('jit-sess-1001');
      expect(single.sessionId).toBe('jit-sess-1001');
      expect(single.status).toBe('ACTIVE');
    });
  });
});
