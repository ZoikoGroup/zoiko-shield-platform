import { Test, TestingModule } from '@nestjs/testing';
import { TwoPartyJitSupportService } from './two-party-jit-support.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('TwoPartyJitSupportService', () => {
  let service: TwoPartyJitSupportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TwoPartyJitSupportService],
    }).compile();

    service = module.get<TwoPartyJitSupportService>(TwoPartyJitSupportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should follow 3-step two-party dual authorization workflow to activate JIT session', () => {
    // Step 1: Initiate
    const session = service.initiateSupportRequest(
      'tenant-acme-corp',
      'engineer-zoiko-01',
      'INC-2026-904',
      'Investigate critical latency spike on connector sync',
      'READ_ONLY_SECURITY_TELEMETRY',
      30,
    );

    expect(session.status).toBe('PENDING_CUSTOMER_APPROVAL');
    expect(session.ephemeralAccessToken).toBeUndefined();

    // Step 2: Customer Admin Signs
    const approved = service.approveByCustomerAdmin(
      session.sessionId,
      'admin-customer-99',
      'sig-cust-99-approved',
    );

    expect(approved.status).toBe('PENDING_PLATFORM_APPROVAL');
    expect(approved.customerAdminSigner).toBe('admin-customer-99');

    // Step 3: Platform Lead Authorizes
    const activated = service.authorizeByPlatformLead(
      session.sessionId,
      'lead-ciso-01',
      'sig-lead-01-authorized',
    );

    expect(activated.status).toBe('ACTIVE_AUTHORIZED');
    expect(activated.ephemeralAccessToken).toBeDefined();
    expect(activated.expiresAt).toBeDefined();
  });

  it('should reject platform lead authorization if customer admin has not approved yet', () => {
    const session = service.initiateSupportRequest(
      'tenant-bank-01',
      'engineer-02',
      'INC-88',
      'Debugging connector crash',
    );

    expect(() =>
      service.authorizeByPlatformLead(session.sessionId, 'lead-01', 'sig-lead'),
    ).toThrow(BadRequestException);
  });

  it('should allow immediate revocation of active session', () => {
    const session = service.initiateSupportRequest(
      'tenant-bank-02',
      'engineer-03',
      'INC-89',
      'Routine review',
    );
    service.approveByCustomerAdmin(session.sessionId, 'cust-admin', 'sig-1');
    service.authorizeByPlatformLead(session.sessionId, 'lead-admin', 'sig-2');

    const revoked = service.revokeSession(
      session.sessionId,
      'Investigation concluded early',
    );

    expect(revoked.status).toBe('REVOKED');
    expect(revoked.ephemeralAccessToken).toBeUndefined();
  });
});
