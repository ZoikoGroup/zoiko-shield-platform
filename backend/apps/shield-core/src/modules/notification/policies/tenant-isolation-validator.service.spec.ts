import { TenantIsolationValidator } from './tenant-isolation-validator.service';
import { BadRequestException } from '@nestjs/common';

describe('TenantIsolationValidator (ZS-EML-TPL-001 v2.0 Gate 3)', () => {
  let validator: TenantIsolationValidator;

  beforeEach(() => {
    validator = new TenantIsolationValidator();
  });

  it('should pass when recipient and resource belong to the same tenant', () => {
    expect(() =>
      validator.validateTenantBoundary({
        tenantId: 'tenant-acme',
        recipientEmail: 'security-officer@acme.com',
        resourceId: 'res-9901',
        resourceTenantId: 'tenant-acme',
        ctaUrl: 'https://app.zoikoshield.com/cases/res-9901',
      }),
    ).not.toThrow();
  });

  it('should throw BadRequestException and block send on cross-tenant resource contamination', () => {
    expect(() =>
      validator.validateTenantBoundary({
        tenantId: 'tenant-acme',
        recipientEmail: 'security-officer@acme.com',
        resourceId: 'res-9901',
        resourceTenantId: 'tenant-foreign-corp',
        ctaUrl: 'https://app.zoikoshield.com/cases/res-9901',
      }),
    ).toThrow(BadRequestException);
  });

  it('should reject non-HTTPS CTA URLs (e.g. javascript: or http:)', () => {
    expect(() =>
      validator.validateTenantBoundary({
        tenantId: 'tenant-acme',
        recipientEmail: 'security-officer@acme.com',
        ctaUrl: 'http://insecure.zoikoshield.com/login',
      }),
    ).toThrow(BadRequestException);
  });
});
