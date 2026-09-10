import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JitSessionWitnessService } from './jit-session-witness.service';
import { JitSessionEnforcerService } from './jit-session-enforcer.service';

describe('JitSessionWitnessService', () => {
  let service: JitSessionWitnessService;
  let enforcer: JitSessionEnforcerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JitSessionWitnessService, JitSessionEnforcerService],
    }).compile();

    service = module.get<JitSessionWitnessService>(JitSessionWitnessService);
    enforcer = module.get<JitSessionEnforcerService>(JitSessionEnforcerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('authorizeElevatedSession', () => {
    it('authorizes valid JIT session with target tenant peer approval', async () => {
      const session = await service.authorizeElevatedSession({
        operatorId: 'operator-support-01',
        operatorHomeTenantId: 'tenant-zoiko-support',
        targetTenantId: 'tenant-customer-bank',
        requestedRole: 'EmergencySecurityResponder',
        clientIp: '198.51.100.15',
        peerToken: {
          approverId: 'ciso-approver@customer-bank.com',
          approverTenantId: 'tenant-customer-bank',
          targetTenantId: 'tenant-customer-bank',
          requestedRole: 'EmergencySecurityResponder',
          signature: 'sig-valid-peer-token-123456789',
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });

      expect(session.sessionId).toBeDefined();
      expect(session.tenantId).toBe('tenant-customer-bank');
      expect(session.status).toBe('ACTIVE');
    });

    it('rejects cross-tenant elevation when approver belongs to foreign tenant', async () => {
      await expect(
        service.authorizeElevatedSession({
          operatorId: 'operator-support-01',
          operatorHomeTenantId: 'tenant-zoiko-support',
          targetTenantId: 'tenant-customer-bank',
          requestedRole: 'EmergencySecurityResponder',
          clientIp: '198.51.100.15',
          peerToken: {
            approverId: 'unauthorized-approver@foreign-tenant.com',
            approverTenantId: 'tenant-foreign-hacker', // Foreign approver!
            targetTenantId: 'tenant-customer-bank',
            requestedRole: 'EmergencySecurityResponder',
            signature: 'sig-invalid-peer-token-123456789',
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          },
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects expired peer approval token', async () => {
      await expect(
        service.authorizeElevatedSession({
          operatorId: 'operator-support-01',
          operatorHomeTenantId: 'tenant-zoiko-support',
          targetTenantId: 'tenant-customer-bank',
          requestedRole: 'EmergencySecurityResponder',
          clientIp: '198.51.100.15',
          peerToken: {
            approverId: 'ciso-approver@customer-bank.com',
            approverTenantId: 'tenant-customer-bank',
            targetTenantId: 'tenant-customer-bank',
            requestedRole: 'EmergencySecurityResponder',
            signature: 'sig-valid-peer-token-123456789',
            expiresAt: new Date(Date.now() - 1000), // Expired!
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('sealTerminalSessionAudit', () => {
    it('seals completed session into tamper-evident Merkle leaf audit', async () => {
      const session = enforcer.createJitSession(
        'operator-support-01',
        'tenant-customer-bank',
        'SecurityAuditor',
        '198.51.100.15',
        15,
      );

      const audit = await service.sealTerminalSessionAudit(session.sessionId, [
        { command: 'GET /api/v1/evidence/ledger', executedAt: new Date().toISOString(), result: '200 OK' },
        { command: 'POST /api/v1/controls/evaluate', executedAt: new Date().toISOString(), result: '200 OK' },
      ]);

      expect(audit.sessionId).toBe(session.sessionId);
      expect(audit.totalCommandsExecuted).toBe(2);
      expect(audit.commandLogDigest).toHaveLength(64);
      expect(audit.merkleLeafHash).toHaveLength(64);
      expect(enforcer.getSession(session.sessionId)?.status).toBe('REVOKED');
    });
  });
});
