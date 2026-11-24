import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { EmailCredentialVaultService } from './email-credential-vault.service';

describe('EmailCredentialVaultService (SEC-02, T04, T16, T17)', () => {
  const rows = new Map<string, any>();
  let seq = 0;
  const prisma: any = {
    emailCredentialSecret: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `sec-${++seq}`, revoked_at: null, ...data };
        rows.set(row.id, row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) => rows.get(where.id) ?? null),
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const row of rows.values()) {
          if (row.tenant_id !== where.tenant_id) continue;
          if ('revoked_at' in where && row.revoked_at !== where.revoked_at)
            continue;
          if (where.id && row.id !== where.id) continue;
          if (where.connection_id && row.connection_id !== where.connection_id)
            continue;
          if (where.intent_id && row.intent_id !== where.intent_id) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      }),
      count: jest.fn(
        async ({ where }: any) =>
          [...rows.values()].filter(
            (r) =>
              r.tenant_id === where.tenant_id &&
              r.purpose === where.purpose &&
              !r.revoked_at,
          ).length,
      ),
    },
  };
  const env = { ...process.env };

  beforeEach(() => {
    rows.clear();
    process.env.EMAIL_CREDENTIAL_DEV_KEY = randomBytes(32).toString('base64');
    delete process.env.EMAIL_CREDENTIAL_KMS_KEY;
    process.env.NODE_ENV = 'test';
  });
  afterAll(() => {
    process.env = env;
  });

  it('round-trips a secret without storing plaintext', async () => {
    const vault = new EmailCredentialVaultService(prisma);
    const id = await vault.store({
      tenantId: 't-1',
      provider: 'MICROSOFT_365',
      purpose: 'OAUTH_REFRESH_TOKEN',
      plaintext: 'refresh-token-value',
    });
    const stored = rows.get(id);
    expect(JSON.stringify(stored)).not.toContain('refresh-token-value');
    expect(stored.key_ref).toBe('dev-local');
    await expect(vault.reveal('t-1', id, 'OAUTH_REFRESH_TOKEN')).resolves.toBe(
      'refresh-token-value',
    );
  });

  it('rejects a cross-tenant or wrong-purpose reference (T04)', async () => {
    const vault = new EmailCredentialVaultService(prisma);
    const id = await vault.store({
      tenantId: 't-1',
      provider: 'GOOGLE_WORKSPACE',
      purpose: 'OAUTH_REFRESH_TOKEN',
      plaintext: 'x',
    });
    await expect(
      vault.reveal('t-2', id, 'OAUTH_REFRESH_TOKEN'),
    ).rejects.toThrow(/CREDENTIAL_TENANT_MISMATCH/);
    await expect(vault.reveal('t-1', id, 'PKCE_VERIFIER')).rejects.toThrow(
      /CREDENTIAL_PURPOSE_MISMATCH/,
    );
  });

  it('detects ciphertext moved to another tenant row (AAD binding)', async () => {
    const vault = new EmailCredentialVaultService(prisma);
    const id = await vault.store({
      tenantId: 't-1',
      provider: 'MICROSOFT_365',
      purpose: 'OAUTH_REFRESH_TOKEN',
      plaintext: 'x',
    });
    rows.get(id).tenant_id = 't-2';
    await expect(
      vault.reveal('t-2', id, 'OAUTH_REFRESH_TOKEN'),
    ).rejects.toThrow();
  });

  it('crypto-shreds on revoke and refuses to reveal afterwards (T16)', async () => {
    const vault = new EmailCredentialVaultService(prisma);
    const id = await vault.store({
      tenantId: 't-1',
      provider: 'MICROSOFT_365',
      purpose: 'OAUTH_REFRESH_TOKEN',
      plaintext: 'x',
      connectionId: 'conn-1',
    });
    await expect(vault.revoke('t-1', { connectionId: 'conn-1' })).resolves.toBe(
      1,
    );
    expect(rows.get(id).ciphertext).toBeNull();
    expect(rows.get(id).wrapped_key).toBeNull();
    await expect(
      vault.reveal('t-1', id, 'OAUTH_REFRESH_TOKEN'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed in production without KMS', () => {
    process.env.NODE_ENV = 'production';
    const vault = new EmailCredentialVaultService(prisma);
    expect(() => vault.assertConfigured()).toThrow(ServiceUnavailableException);
  });

  it('fails closed without any key', () => {
    delete process.env.EMAIL_CREDENTIAL_DEV_KEY;
    const vault = new EmailCredentialVaultService(prisma);
    expect(() => vault.assertConfigured()).toThrow(
      /CREDENTIAL_VAULT_NOT_CONFIGURED/,
    );
  });
});
