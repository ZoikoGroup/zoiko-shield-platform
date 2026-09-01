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

    const check = service.checkSessionValidity(session.sessionId, '198.51.100.25');
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

    const check = service.checkSessionValidity(session.sessionId, '203.0.113.88'); // Divergent IP
    expect(check.valid).toBe(false);
    expect(check.status).toBe('REVOKED');
    expect(check.reason).toContain('IP divergence');
  });

  it('should successfully refresh step-up with valid hardware signature', () => {
    const session = service.createJitSession(
      operatorId,
      tenantId,
      'SECURITY_ADMIN',
      '198.51.100.25',
      15,
      5,
    );

    const stepUp = service.verifyHardwareStepUp(
      session.sessionId,
      'fido2-webauthn-valid-challenge-signature-xyz',
    );
    expect(stepUp.success).toBe(true);
    expect(stepUp.nextStepUpDueAt).toBeDefined();
  });
});
