import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FederationRuntimeService } from './federation-runtime.service';

describe('FederationRuntimeService', () => {
  it('enforces production HTTPS and the IdP hostname allowlist', () => {
    const service = new FederationRuntimeService(
      new ConfigService({
        NODE_ENV: 'production',
        SSO_ALLOWED_IDP_HOSTS: 'login.example.com',
      }),
    );
    expect(
      service.assertApprovedExternalUrl(
        'https://login.example.com/oidc',
        'issuer',
      ).hostname,
    ).toBe('login.example.com');
    expect(() =>
      service.assertApprovedExternalUrl('http://login.example.com', 'issuer'),
    ).toThrow(BadRequestException);
    expect(() =>
      service.assertApprovedExternalUrl('https://metadata.internal', 'issuer'),
    ).toThrow(BadRequestException);
  });

  it('rejects open redirects in the post-login return path', () => {
    const service = new FederationRuntimeService(
      new ConfigService({ NODE_ENV: 'test' }),
    );
    expect(() => service.applicationRedirect('//attacker.example')).toThrow(
      BadRequestException,
    );
  });
});
