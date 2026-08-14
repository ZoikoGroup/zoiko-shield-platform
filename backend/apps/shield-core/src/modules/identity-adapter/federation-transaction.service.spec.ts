import { ConfigService } from '@nestjs/config';
import { FederationRuntimeService } from './federation-runtime.service';
import { FederationTransactionService } from './federation-transaction.service';

describe('FederationTransactionService', () => {
  it('stores only hashed state, encrypts secrets and consumes a transaction once', async () => {
    let row: any;
    const repository = {
      create: jest.fn((value) => ({ id: 'transaction-1', ...value })),
      save: jest.fn(async (value) => {
        row = value;
        return value;
      }),
      findOne: jest.fn(async () => (row?.consumedAt ? null : row)),
      update: jest.fn(async () => {
        row.consumedAt = new Date();
        return { affected: 1 };
      }),
    };
    const runtime = new FederationRuntimeService(
      new ConfigService({
        NODE_ENV: 'test',
        JWT_SECRET: 'unit-test-jwt-secret',
        SSO_TRANSACTION_ENCRYPTION_KEY:
          'unit-test-distinct-sso-key-at-least-32-bytes',
      }),
    );
    const service = new FederationTransactionService(
      repository as any,
      runtime,
    );

    const state = await service.create({
      identityProviderConfigurationId: 'provider-1',
      tenantId: 'tenant-1',
      environmentId: 'environment-1',
      protocol: 'OIDC',
      secrets: {
        nonce: 'nonce-value',
        pkceCodeVerifier: 'pkce-secret',
        invitationToken: 'invite-secret',
      },
    });

    expect(row.stateHash).not.toBe(state);
    expect(row.stateHash).toHaveLength(64);
    expect(row.encryptedPayload).not.toContain('pkce-secret');
    await expect(service.consume(state, 'OIDC')).resolves.toMatchObject({
      secrets: {
        nonce: 'nonce-value',
        pkceCodeVerifier: 'pkce-secret',
        invitationToken: 'invite-secret',
      },
    });
    await expect(service.consume(state, 'OIDC')).rejects.toThrow(
      /invalid, expired or already used/,
    );
  });
});
