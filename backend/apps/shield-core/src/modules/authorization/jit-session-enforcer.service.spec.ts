import { Test, TestingModule } from '@nestjs/testing';
import { JitSessionEnforcerService } from './jit-session-enforcer.service';

describe('JitSessionEnforcerService', () => {
  let service: JitSessionEnforcerService;
  const operatorId = 'operator-sec-99';
  const tenantId = 'tenant-global-bank';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JitSessionEnforcerService],
    }).compile();

    service = module.get<JitSessionEnforcerService>(JitSessionEnforcerService);
  });

  it('should create an active JIT session with hardware step-up tracking', () => {
    const session = service.createJitSession(
      operatorId,
      tenantId,
      'SECURITY_ADMIN',
      '198.51.100.25',
      15,
      5,
    );

    expect(session.sessionId).toBeDefined();
    expect(session.status).toBe('ACTIVE');
    expect(session.elevatedRole).toBe('SECURITY_ADMIN');

    const check = service.checkSessionValidity(
      session.sessionId,
      '198.51.100.25',
    );
    expect(check.valid).toBe(true);
    expect(check.status).toBe('ACTIVE');
  });

  it('should auto-revoke session on IP divergence / hijacking attempt', () => {
    const session = service.createJitSession(
      operatorId,
      tenantId,
      'SECURITY_ADMIN',
      '198.51.100.25',
      15,
      5,
    );

    const check = service.checkSessionValidity(
      session.sessionId,
      '203.0.113.88',
    ); // Divergent IP
    expect(check.valid).toBe(false);
    expect(check.status).toBe('REVOKED');
    expect(check.reason).toContain('IP divergence');
  });

  it('should successfully refresh step-up with a verified passkey assertion', () => {
    const session = service.createJitSession(
      operatorId,
      tenantId,
      'SECURITY_ADMIN',
      '198.51.100.25',
      15,
      5,
    );

    const stepUp = service.recordVerifiedStepUp(session.sessionId, {
      principalId: operatorId,
      credentialId: 'cred-1',
      userVerified: true,
      verifiedAt: Date.now(),
    });
    expect(stepUp.success).toBe(true);
    expect(stepUp.nextStepUpDueAt).toBeDefined();
  });

  it('rejects a step-up proof issued for a different operator', () => {
    const session = service.createJitSession(
      operatorId,
      tenantId,
      'SECURITY_ADMIN',
      '198.51.100.25',
    );

    const stepUp = service.recordVerifiedStepUp(session.sessionId, {
      principalId: 'operator-someone-else',
      credentialId: 'cred-1',
      userVerified: true,
      verifiedAt: Date.now(),
    });

    expect(stepUp.success).toBe(false);
    expect(stepUp.reason).toContain('different operator');
  });

  it('rejects a step-up proof without a user-verification gesture', () => {
    const session = service.createJitSession(
      operatorId,
      tenantId,
      'SECURITY_ADMIN',
      '198.51.100.25',
    );

    const stepUp = service.recordVerifiedStepUp(session.sessionId, {
      principalId: operatorId,
      credentialId: 'cred-1',
      userVerified: false,
      verifiedAt: Date.now(),
    });

    expect(stepUp.success).toBe(false);
    expect(stepUp.reason).toContain('user-verification');
  });

  it('rejects a stockpiled (stale) step-up proof', () => {
    const session = service.createJitSession(
      operatorId,
      tenantId,
      'SECURITY_ADMIN',
      '198.51.100.25',
    );

    const stepUp = service.recordVerifiedStepUp(session.sessionId, {
      principalId: operatorId,
      credentialId: 'cred-1',
      userVerified: true,
      verifiedAt: Date.now() - 10 * 60 * 1000,
    });

    expect(stepUp.success).toBe(false);
    expect(stepUp.reason).toContain('stale');
  });
});
