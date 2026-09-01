import { Test, TestingModule } from '@nestjs/testing';
import { DynamicTokenizationProxyService } from './dynamic-tokenization-proxy.service';
import { UnauthorizedException } from '@nestjs/common';

describe('DynamicTokenizationProxyService', () => {
  let service: DynamicTokenizationProxyService;
  const tenantId = 'tenant-fpe-test-101';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DynamicTokenizationProxyService],
    }).compile();

    service = module.get<DynamicTokenizationProxyService>(
      DynamicTokenizationProxyService,
    );
  });

  it('should mask sensitive strings properly in FULL_MASK mode', () => {
    const emailMasked = service.maskEmail('security.director@megacorp.com');
    expect(emailMasked).toBe('s***r@megacorp.com');

    const cardMasked = service.maskCreditCard('4111-2222-3333-4444');
    expect(cardMasked).toBe('4111-XXXX-XXXX-4444');

    const ipMasked = service.maskIp('198.51.100.44');
    expect(ipMasked).toBe('198.51.XXX.XXX');
  });

  it('should anonymize nested telemetry JSON objects', () => {
    const rawTelemetry = {
      event: 'MALWARE_C2_CALLBACK',
      user: {
        email: 'attacker.target@corp.internal',
        card: '5500123456789999',
      },
      network: {
        src_ip: '10.0.4.15',
        dst_ip: '203.0.113.88',
      },
    };

    const anonymized = service.anonymizeObject(
      tenantId,
      rawTelemetry,
      'FULL_MASK',
    );
    expect(anonymized.user.email).toBe('a***t@corp.internal');
    expect(anonymized.user.card).toBe('5500-XXXX-XXXX-9999');
    expect(anonymized.network.src_ip).toBe('10.0.XXX.XXX');
    expect(anonymized.network.dst_ip).toBe('203.0.XXX.XXX');
  });

  it('should support reversible encrypted tokens with JIT authorization', () => {
    const originalEmail = 'ciso.lead@defense-contractor.gov';
    const token = service.generateReversibleToken(
      tenantId,
      originalEmail,
      'EMAIL',
    );
    expect(token).toContain('fpe_email_');

    // Attempt without JIT authorization -> should fail
    expect(() =>
      service.unmaskValue(tenantId, token, {
        operatorId: '',
        jitRequestId: '',
        reason: 'Curiosity',
      }),
    ).toThrow(UnauthorizedException);

    // Unmask with valid JIT elevation
    const unmasked = service.unmaskValue(tenantId, token, {
      operatorId: 'sec-op-404',
      jitRequestId: 'JIT-2026-FPE-001',
      reason: 'Forensic incident investigation',
    });
    expect(unmasked).toBe(originalEmail);

    const audits = service.getAuditTrail();
    expect(audits.length).toBe(1);
    expect(audits[0].operatorId).toBe('sec-op-404');
    expect(audits[0].jitRequestId).toBe('JIT-2026-FPE-001');
  });
});
