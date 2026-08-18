import { Test, TestingModule } from '@nestjs/testing';
import { EntraTokenService } from './entra.token.service';
import { CredentialService } from '../../services/credential.service';
import { ConnectorAuthenticationError } from '../../core/connector-errors';

describe('EntraTokenService', () => {
  let service: EntraTokenService;
  let credentialMock: any;
  const originalFetch = global.fetch;
  const originalClientId = process.env.ENTRA_CLIENT_ID;

  beforeEach(async () => {
    credentialMock = {
      resolveClientSecret: jest.fn().mockResolvedValue('super-secret'),
    };
    process.env.ENTRA_CLIENT_ID = 'client-id-under-test';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntraTokenService,
        { provide: CredentialService, useValue: credentialMock },
      ],
    }).compile();

    service = module.get<EntraTokenService>(EntraTokenService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.ENTRA_CLIENT_ID = originalClientId;
  });

  it('throws ConnectorAuthenticationError instead of returning a fake token when externalTenantId is missing', async () => {
    await expect(service.getAccessToken('instance-1', '')).rejects.toThrow(
      ConnectorAuthenticationError,
    );
  });

  it('throws ConnectorAuthenticationError instead of silently succeeding when Microsoft rejects the token request', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid_client',
    }) as any;

    await expect(
      service.getAccessToken('instance-1', 'external-tenant-1'),
    ).rejects.toThrow(ConnectorAuthenticationError);
  });

  it('caches a successfully acquired token and does not re-fetch until near expiry', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'tok-abc', expires_in: 3600 }),
    });
    global.fetch = fetchMock as any;

    const first = await service.getAccessToken(
      'instance-1',
      'external-tenant-1',
    );
    const second = await service.getAccessToken(
      'instance-1',
      'external-tenant-1',
    );

    expect(first).toBe('tok-abc');
    expect(second).toBe('tok-abc');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('decodes the roles claim out of a JWT access token', () => {
    const payload = Buffer.from(
      JSON.stringify({ roles: ['User.Read.All', 'AuditLog.Read.All'] }),
    ).toString('base64url');
    const fakeJwt = `header.${payload}.signature`;

    expect(service.decodeGrantedRoles(fakeJwt)).toEqual([
      'User.Read.All',
      'AuditLog.Read.All',
    ]);
  });

  it('returns an empty array instead of throwing when the token is not well-formed', () => {
    expect(service.decodeGrantedRoles('not-a-jwt')).toEqual([]);
  });
});
