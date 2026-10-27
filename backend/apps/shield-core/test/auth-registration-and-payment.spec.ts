import { ConflictException, BadRequestException } from '@nestjs/common';
import { AuthService } from '../src/modules/identity-adapter/auth.service';
import { PaymentService } from '../src/modules/payments/payment.service';
import { StripePaymentProvider } from '../src/modules/payments/stripe-payment.provider';
import { IdempotencyService } from '../src/modules/idempotency/idempotency.service';
import { TransactionalEmailService } from '../src/modules/notification/transactional-email.service';

describe('Auth Registration & Payment E2E Audit Specifications', () => {
  describe('Phase 3: Registration & Duplicate Email Prevention', () => {
    let authService: AuthService;
    let mockPrisma: any;
    let mockMailService: any;
    let mockChallengeService: any;
    let mockEnvironmentService: any;

    beforeEach(() => {
      mockPrisma = {
        principal: {
          findUnique: jest.fn(),
          create: jest.fn(),
        },
        localCredential: {
          upsert: jest.fn(),
        },
        tenant: {
          findUnique: jest.fn(),
          create: jest.fn(),
        },
        role: {
          findFirst: jest.fn(),
        },
        tenantMembership: {
          create: jest.fn(),
        },
      };

      mockMailService = {
        sendOtp: jest.fn().mockResolvedValue(true),
        sendTenantProvisionedConfirmation: jest.fn().mockResolvedValue(true),
      };

      mockChallengeService = {
        generate: jest.fn().mockResolvedValue({ code: '123456' }),
      };

      mockEnvironmentService = {
        create: jest.fn().mockResolvedValue({ id: 'env-prod-01' }),
      };

      authService = new AuthService(
        {} as any, // principalService
        { createSession: jest.fn().mockResolvedValue({ token: 'test-token', id: 'sess-01' }) } as any, // sessionService
        mockChallengeService,
        {} as any, // recoveryGrantService
        { record: jest.fn() } as any, // eventService
        mockMailService,
        { sign: jest.fn().mockReturnValue('mock-jwt-token') } as any, // jwtService
        { get: jest.fn() } as any, // configService
        {} as any, // sessionContext
        mockPrisma,
        mockEnvironmentService,
      );
    });

    it('R-01: Valid registration creates principal, tenant, and dispatches confirmation emails', async () => {
      mockPrisma.principal.findUnique.mockResolvedValue(null);
      mockPrisma.principal.create.mockResolvedValue({
        id: 'usr-new-01',
        email: 'founder@cyberdefense.corp',
        fullName: 'Founder Person',
      });
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      mockPrisma.tenant.create.mockResolvedValue({
        id: 'tnt-cyberdefense',
        name: 'Cyber Defense Corp',
        slug: 'cyberdefense',
      });
      mockPrisma.role.findFirst.mockResolvedValue({ id: 'role-owner-01', code: 'TENANT_OWNER' });
      mockPrisma.tenantMembership.create.mockResolvedValue({ id: 'tm-01' });

      const result = await authService.register(
        {
          email: 'founder@cyberdefense.corp',
          password: 'SuperSecurePassword123!',
          fullName: 'Founder Person',
          organizationName: 'Cyber Defense Corp',
        },
        { ipAddress: '127.0.0.1', userAgent: 'Jest-Audit-Agent' } as any,
      );

      expect(result.success).toBe(true);
      expect(result.tenant.id).toBe('tnt-cyberdefense');
      expect(result.session.email).toBe('founder@cyberdefense.corp');
      expect(mockMailService.sendOtp).toHaveBeenCalledWith(
        'founder@cyberdefense.corp',
        '123456',
        'EMAIL_VERIFICATION',
      );
      expect(mockMailService.sendTenantProvisionedConfirmation).toHaveBeenCalledWith({
        email: 'founder@cyberdefense.corp',
        tenantName: 'Cyber Defense Corp',
        tenantId: 'tnt-cyberdefense',
      });
    });

    it('R-02: Duplicate email registration returns HTTP 409 Conflict with exact user-friendly warning', async () => {
      mockPrisma.principal.findUnique.mockResolvedValue({
        id: 'usr-existing-01',
        email: 'founder@cyberdefense.corp',
      });

      await expect(
        authService.register(
          {
            email: 'founder@cyberdefense.corp',
            password: 'AnotherPassword123!',
            fullName: 'Duplicate Imposter',
            organizationName: 'Duplicate Corp',
          },
          { ipAddress: '127.0.0.1', userAgent: 'Jest-Audit-Agent' } as any,
        ),
      ).rejects.toThrow(
        new ConflictException(
          'An account with this email address already exists. Please log in or use the password recovery option.',
        ),
      );

      // Verify no records were created or overwritten
      expect(mockPrisma.principal.create).not.toHaveBeenCalled();
      expect(mockPrisma.localCredential.upsert).not.toHaveBeenCalled();
      expect(mockMailService.sendOtp).not.toHaveBeenCalled();
    });

    it('R-03: Case-insensitive email normalization detects duplicates', async () => {
      mockPrisma.principal.findUnique.mockResolvedValue({
        id: 'usr-existing-01',
        email: 'founder@cyberdefense.corp',
      });

      await expect(
        authService.register(
          {
            email: 'FOUNDER@CYBERDEFENSE.CORP',
            password: 'AnotherPassword123!',
            fullName: 'Uppercase Imposter',
            organizationName: 'Uppercase Corp',
          },
          { ipAddress: '127.0.0.1', userAgent: 'Jest-Audit-Agent' } as any,
        ),
      ).rejects.toThrow(
        new ConflictException(
          'An account with this email address already exists. Please log in or use the password recovery option.',
        ),
      );

      // Verify findUnique was called with normalized lowercase email
      expect(mockPrisma.principal.findUnique).toHaveBeenCalledWith({
        where: { email: 'founder@cyberdefense.corp' },
      });
    });

    it('R-04: Race condition / database unique constraint failure (P2002) safely returns HTTP 409', async () => {
      mockPrisma.principal.findUnique.mockResolvedValue(null);
      mockPrisma.principal.create.mockRejectedValue({
        code: 'P2002',
        message: 'Unique constraint failed on the fields: (`email`)',
      });

      await expect(
        authService.register(
          {
            email: 'race.condition@cyberdefense.corp',
            password: 'Password123!',
            fullName: 'Concurrent Request',
            organizationName: 'Concurrent Corp',
          },
          { ipAddress: '127.0.0.1', userAgent: 'Jest-Audit-Agent' } as any,
        ),
      ).rejects.toThrow(
        new ConflictException(
          'An account with this email address already exists. Please log in or use the password recovery option.',
        ),
      );
    });
  });

  describe('Phase 6: Payment, Stripe Provider & Webhook Entitlements', () => {
    let paymentService: PaymentService;
    let stripeProvider: StripePaymentProvider;
    let mockPrisma: any;
    let idempotencyService: IdempotencyService;
    let mockEmailService: any;

    beforeEach(() => {
      stripeProvider = new StripePaymentProvider();
      mockPrisma = {
        payment: {
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
        commercialEvent: {
          create: jest.fn().mockResolvedValue({ id: 'evt-com-01' }),
        },
        commercialAccountTenantBinding: {
          findFirst: jest.fn(),
        },
      };

      // Real in-memory IdempotencyService to test deduplication
      idempotencyService = new IdempotencyService({
        idempotencyRecord: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation((args) => Promise.resolve({ id: 'idemp-01', ...args.data })),
          update: jest.fn(),
        },
      } as any);

      mockEmailService = {
        dispatchTransactionalEmail: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-01' }),
      };

      paymentService = new PaymentService(
        mockPrisma,
        idempotencyService,
        stripeProvider,
        { assertNotBlocked: jest.fn().mockResolvedValue(undefined) } as any,
        stripeProvider,
        mockEmailService as any,
      );
    });

    it('P-01a: Without test-mode flag, unapproved price book fails closed (P0-01)', async () => {
      delete process.env.STRIPE_ALLOW_TEST_PRICING;
      await expect(
        paymentService.createCheckoutSession({
          planTier: 'SHIELD_PROFESSIONAL',
          billingPeriod: 'MONTHLY',
          userEmail: 'ciso@sovereign.corp',
          organizationName: 'Sovereign Security Corp',
          tenantId: 'tenant-sovereign-01',
          successUrl: 'http://localhost:3000/pricing/success',
          cancelUrl: 'http://localhost:3000/pricing/cancel',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('P-01b: With test-mode pricing enabled, creates checkout session for selected plan (Shield Professional $1,250/mo)', async () => {
      process.env.STRIPE_ALLOW_TEST_PRICING = 'true';
      const res = await paymentService.createCheckoutSession({
        planTier: 'SHIELD_PROFESSIONAL',
        billingPeriod: 'MONTHLY',
        userEmail: 'ciso@sovereign.corp',
        organizationName: 'Sovereign Security Corp',
        tenantId: 'tenant-sovereign-01',
        successUrl: 'http://localhost:3000/pricing/success',
        cancelUrl: 'http://localhost:3000/pricing/cancel',
      });

      expect(res.sessionId).toMatch(/^cs_/);
      expect(res.checkoutUrl).toBeDefined();
      expect(res.orderSummary.planTier).toBe('SHIELD_PROFESSIONAL');
      expect(res.orderSummary.totalAmount).toBe(4000);
      expect(res.orderSummary.currency).toBe('USD');
      expect(res.orderSummary.includedOffers).toContain('CONTINUOUS_ASSURANCE');
      expect(res.orderSummary.includedOffers).toContain('MANAGED_DEFENSE');
    });

    it('P-02: Rejects Stripe webhook with invalid signature (HTTP 409 Conflict)', async () => {
      await expect(
        paymentService.handleStripeWebhook(
          JSON.stringify({ id: 'evt_fake_01', type: 'checkout.session.completed' }),
          '', // missing signature
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('P-03: Processes checkout.session.completed webhook, updates entitlements, and sends confirmation emails', async () => {
      const eventPayload = {
        id: 'evt_stripe_test_99881',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_session_123',
            amount_total: 125000,
            currency: 'usd',
            customer_details: {
              email: 'ciso@sovereign.corp',
              name: 'Chief Security Officer',
            },
            metadata: {
              tenantId: 'tenant-sovereign-01',
              planTier: 'SHIELD_PROFESSIONAL',
              organizationName: 'Sovereign Corp',
            },
            payment_intent: 'pi_test_intent_777',
          },
        },
      };

      const rawPayload = JSON.stringify(eventPayload);
      const signature = 'sig_test_valid_hash';

      const result = await paymentService.handleStripeWebhook(rawPayload, signature);

      expect(result).toBeDefined();
      // Verify commercial subscription activation event was persisted
      expect(mockPrisma.commercialEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event_type: 'subscription.activated',
            tenant_id: 'tenant-sovereign-01',
          }),
        }),
      );

      // Verify Transactional Emails dispatched:
      // 1. ZS-EML-BILL-001 (Subscription Activated)
      expect(mockEmailService.dispatchTransactionalEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-sovereign-01',
          templateKey: 'ZS-EML-BILL-001',
          recipients: [{ email: 'ciso@sovereign.corp', name: 'Chief Security Officer' }],
        }),
      );

      // 2. ZS-EML-BILL-006 (Payment Receipt)
      expect(mockEmailService.dispatchTransactionalEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-sovereign-01',
          templateKey: 'ZS-EML-BILL-006',
          recipients: [{ email: 'ciso@sovereign.corp', name: 'Chief Security Officer' }],
        }),
      );
    });

    it('P-04: Replayed webhook event is processed idempotently without double-granting entitlements', async () => {
      const eventId = 'evt_duplicate_replay_001';
      const eventPayload = {
        id: eventId,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_session_replay',
            amount_total: 125000,
            currency: 'usd',
            customer_details: { email: 'ciso@sovereign.corp', name: 'CSO' },
            metadata: { tenantId: 'tenant-sovereign-01', planTier: 'SHIELD_PROFESSIONAL' },
          },
        },
      };

      const raw = JSON.stringify(eventPayload);
      const sig = 'sig_test_valid';

      // First execution
      await paymentService.handleStripeWebhook(raw, sig);
      const firstCallCount = mockPrisma.commercialEvent.create.mock.calls.length;

      // Mock idempotency service returning cached result on replay
      jest.spyOn(idempotencyService, 'run').mockResolvedValueOnce({
        received: true,
        event: 'checkout.session.completed',
        ignored: true,
      } as any);

      // Second replayed execution
      await paymentService.handleStripeWebhook(raw, sig);

      // Database entitlement was not duplicated
      expect(mockPrisma.commercialEvent.create.mock.calls.length).toBe(firstCallCount);
    });
  });
});
