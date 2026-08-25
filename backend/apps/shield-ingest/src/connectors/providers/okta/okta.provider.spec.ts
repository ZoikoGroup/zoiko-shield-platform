import { Test, TestingModule } from '@nestjs/testing';
import { OktaProvider } from './okta.provider';
import { OktaNormalizerService } from './okta.normalizer';
import { OktaEventPayload } from './okta.types';

describe('OktaProvider & Normalizer', () => {
  let provider: OktaProvider;
  let normalizer: OktaNormalizerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OktaProvider, OktaNormalizerService],
    }).compile();

    provider = module.get<OktaProvider>(OktaProvider);
    normalizer = module.get<OktaNormalizerService>(OktaNormalizerService);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
    expect(normalizer).toBeDefined();
  });

  it('normalizes Okta user.authentication.authenticate event', () => {
    const sampleEvent: OktaEventPayload = {
      eventId: 'okta-evt-001',
      eventType: 'user.authentication.authenticate',
      published: '2026-08-25T11:30:00Z',
      displayMessage: 'User login to Okta',
      actor: {
        id: 'usr_okta_123',
        type: 'User',
        alternateId: 'analyst@company.com',
        displayName: 'Security Analyst',
      },
      client: {
        ipAddress: '198.51.100.22',
        geographicalContext: {
          city: 'London',
          country: 'United Kingdom',
        },
      },
      outcome: {
        result: 'SUCCESS',
      },
    };

    const normalized = normalizer.normalizeEvent(
      sampleEvent,
      'tenant-okta-01',
      'env-prod',
      'eu-west-2',
    );

    expect(normalized.tenant_id).toBe('tenant-okta-01');
    expect(normalized.category_uid).toBe(3); // IAM
    expect(normalized.class_uid).toBe(3002); // Authentication
    expect(normalized.status).toBe('SUCCESS');
    expect(normalized.actor.user.email_addr).toBe('analyst@company.com');
    expect(normalized.src_endpoint?.ip).toBe('198.51.100.22');
    expect(normalized.src_endpoint?.location?.city).toBe('London');
    expect(normalized.raw_payload_hash).toBeDefined();
  });

  it('normalizes failed login attempt with high severity', () => {
    const failedEvent: OktaEventPayload = {
      eventId: 'okta-evt-002',
      eventType: 'user.authentication.authenticate',
      published: '2026-08-25T11:35:00Z',
      displayMessage: 'Invalid credentials',
      actor: {
        id: 'usr_okta_456',
        type: 'User',
        alternateId: 'victim@company.com',
        displayName: 'Target User',
      },
      client: {
        ipAddress: '203.0.113.88',
      },
      outcome: {
        result: 'FAILURE',
        reason: 'INVALID_CREDENTIALS',
      },
    };

    const normalized = normalizer.normalizeEvent(
      failedEvent,
      'tenant-okta-01',
      'env-prod',
      'us-east-1',
    );

    expect(normalized.status).toBe('FAILURE');
    expect(normalized.severity).toBe('HIGH');
    expect(normalized.status_detail).toBe('INVALID_CREDENTIALS');
  });

  it('rejects connection when apiToken is missing', async () => {
    const res = await provider.connect(
      { tenantId: 'ten-1', environmentId: 'env-1' } as any,
      { orgUrl: 'https://dev-12345.okta.com' } as any,
    );
    expect(res.status).toBe('FAILED');
    expect(res.error).toContain('apiToken are mandatory');
  });
});
