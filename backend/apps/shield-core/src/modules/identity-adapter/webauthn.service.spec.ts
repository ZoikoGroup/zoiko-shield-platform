import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { WebauthnService } from './webauthn.service';
import { PrismaService } from '../../prisma/prisma.service';

const RP_ID = 'shield.test';
const ORIGIN = 'https://shield.test';
const PRINCIPAL_ID = '11111111-1111-4111-8111-111111111111';

/** Minimal in-memory stand-in with the slice of the Prisma delegate API used here. */
function makeDelegate() {
  const rows: any[] = [];
  const matches = (row: any, where: any) =>
    Object.entries(where ?? {}).every(([key, value]) => {
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        const operator = value as { lt?: Date; gt?: Date };
        if (operator.lt !== undefined && !(row[key] < operator.lt)) {
          return false;
        }
        if (operator.gt !== undefined && !(row[key] > operator.gt)) {
          return false;
        }
        return true;
      }
      // A null filter must be honoured or consumed-challenge and
      // revoked-credential filtering would silently pass in tests while
      // working in production.
      return (row[key] ?? null) === (value ?? null);
    });

  return {
    rows,
    create: async ({ data }: any) => {
      const row = {
        id: `row-${rows.length + 1}`,
        createdAt: new Date(),
        ...data,
      };
      rows.push(row);
      return { ...row };
    },
    findMany: async ({ where }: any = {}) =>
      rows.filter((r) => matches(r, where)).map((r) => ({ ...r })),
    findFirst: async ({ where }: any) => {
      const row = rows.find((r) => matches(r, where));
      return row ? { ...row } : null;
    },
    findUnique: async ({ where }: any) => {
      const row = rows.find((r) => matches(r, where));
      return row ? { ...row } : null;
    },
    update: async ({ where, data }: any) => {
      const row = rows.find((r) => matches(r, where));
      if (!row) throw new Error('Record to update not found');
      Object.assign(row, data);
      return { ...row };
    },
    updateMany: async ({ where, data }: any) => {
      const matched = rows.filter((r) => matches(r, where));
      matched.forEach((row) => Object.assign(row, data));
      return { count: matched.length };
    },
    deleteMany: async () => ({ count: 0 }),
  };
}

function buildAuthenticatorData(
  rpId: string,
  flags: number,
  signCount: number,
): Buffer {
  const rpIdHash = crypto.createHash('sha256').update(rpId).digest();
  const tail = Buffer.alloc(5);
  tail[0] = flags;
  tail.writeUInt32BE(signCount, 1);
  return Buffer.concat([rpIdHash, tail]);
}

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;

describe('WebauthnService', () => {
  let service: WebauthnService;
  let credentials: ReturnType<typeof makeDelegate>;
  let challenges: ReturnType<typeof makeDelegate>;
  let keyPair: crypto.KeyPairKeyObjectResult;

  beforeAll(() => {
    process.env.WEBAUTHN_RP_ID = RP_ID;
    process.env.WEBAUTHN_ORIGIN = ORIGIN;
    keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  });

  beforeEach(async () => {
    credentials = makeDelegate();
    challenges = makeDelegate();
    const principals = makeDelegate();
    await principals.create({
      data: {
        id: PRINCIPAL_ID,
        email: 'analyst@acme.test',
        fullName: 'Test Analyst',
      },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebauthnService,
        {
          provide: PrismaService,
          useValue: {
            webauthnCredential: credentials,
            webauthnChallenge: challenges,
            principal: principals,
          },
        },
      ],
    }).compile();

    service = module.get<WebauthnService>(WebauthnService);
  });

  const clientDataFor = (type: string, challenge: string, origin = ORIGIN) =>
    Buffer.from(JSON.stringify({ type, challenge, origin })).toString('base64');

  async function registerPasskey(): Promise<void> {
    const options = await service.createRegistrationOptions(PRINCIPAL_ID);
    await service.verifyRegistration(PRINCIPAL_ID, {
      credentialId: 'cred-abc',
      publicKeySpkiBase64: keyPair.publicKey
        .export({ format: 'der', type: 'spki' })
        .toString('base64'),
      clientDataJsonBase64: clientDataFor('webauthn.create', options.challenge),
    });
  }

  /** Signs exactly what a real authenticator signs: authData || SHA-256(clientDataJSON). */
  function signAssertion(
    challenge: string,
    opts?: {
      flags?: number;
      signCount?: number;
      rpId?: string;
      origin?: string;
    },
  ) {
    const authData = buildAuthenticatorData(
      opts?.rpId ?? RP_ID,
      opts?.flags ?? FLAG_UP | FLAG_UV,
      opts?.signCount ?? 1,
    );
    const clientDataJsonBase64 = clientDataFor(
      'webauthn.get',
      challenge,
      opts?.origin ?? ORIGIN,
    );
    const clientDataHash = crypto
      .createHash('sha256')
      .update(Buffer.from(clientDataJsonBase64, 'base64'))
      .digest();
    const signature = crypto
      .createSign('SHA256')
      .update(Buffer.concat([authData, clientDataHash]))
      .sign(keyPair.privateKey);

    return {
      credentialId: 'cred-abc',
      clientDataJsonBase64,
      authenticatorDataBase64: authData.toString('base64'),
      signatureBase64: signature.toString('base64'),
    };
  }

  it('registers a passkey and then authenticates it with a real signature', async () => {
    await registerPasskey();
    expect(credentials.rows).toHaveLength(1);

    const options =
      await service.createAuthenticationOptions('analyst@acme.test');
    expect(options.allowCredentials).toEqual([
      { type: 'public-key', id: 'cred-abc' },
    ]);

    const result = await service.verifyAssertion(
      signAssertion(options.challenge) as any,
      'AUTHENTICATION',
    );

    expect(result.principalId).toBe(PRINCIPAL_ID);
    expect(result.userVerified).toBe(true);
    expect(credentials.rows[0].signCount).toBe(BigInt(1));
  });

  it('never exposes the bigint signature counter in a passkey summary', async () => {
    const options = await service.createRegistrationOptions(PRINCIPAL_ID);
    const summary = await service.verifyRegistration(PRINCIPAL_ID, {
      credentialId: 'cred-abc',
      publicKeySpkiBase64: keyPair.publicKey
        .export({ format: 'der', type: 'spki' })
        .toString('base64'),
      clientDataJsonBase64: clientDataFor('webauthn.create', options.challenge),
    });

    expect(summary).not.toHaveProperty('signCount');
    expect(() => JSON.stringify(summary)).not.toThrow();
    const listed = await service.listCredentials(PRINCIPAL_ID);
    expect(listed).toHaveLength(1);
    expect(() => JSON.stringify(listed)).not.toThrow();
  });

  it('rejects an assertion replayed on an already-consumed challenge', async () => {
    await registerPasskey();
    const options =
      await service.createAuthenticationOptions('analyst@acme.test');
    const assertion = signAssertion(options.challenge);

    await service.verifyAssertion(assertion as any, 'AUTHENTICATION');

    await expect(
      service.verifyAssertion(assertion as any, 'AUTHENTICATION'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an assertion from a phishing origin', async () => {
    await registerPasskey();
    const options =
      await service.createAuthenticationOptions('analyst@acme.test');

    await expect(
      service.verifyAssertion(
        signAssertion(options.challenge, {
          origin: 'https://shield.test.evil.example',
        }) as any,
        'AUTHENTICATION',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an assertion whose RP ID hash does not match', async () => {
    await registerPasskey();
    const options =
      await service.createAuthenticationOptions('analyst@acme.test');

    await expect(
      service.verifyAssertion(
        signAssertion(options.challenge, { rpId: 'other.test' }) as any,
        'AUTHENTICATION',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an assertion without the user-verification flag', async () => {
    await registerPasskey();
    const options =
      await service.createAuthenticationOptions('analyst@acme.test');

    await expect(
      service.verifyAssertion(
        signAssertion(options.challenge, { flags: FLAG_UP }) as any,
        'AUTHENTICATION',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a tampered signature', async () => {
    await registerPasskey();
    const options =
      await service.createAuthenticationOptions('analyst@acme.test');
    const assertion = signAssertion(options.challenge);
    const forged = Buffer.from(assertion.signatureBase64, 'base64');
    forged[forged.length - 1] ^= 0xff;

    await expect(
      service.verifyAssertion(
        { ...assertion, signatureBase64: forged.toString('base64') } as any,
        'AUTHENTICATION',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('revokes the credential when the signature counter fails to advance', async () => {
    await registerPasskey();

    const first =
      await service.createAuthenticationOptions('analyst@acme.test');
    await service.verifyAssertion(
      signAssertion(first.challenge, { signCount: 5 }) as any,
      'AUTHENTICATION',
    );

    const second =
      await service.createAuthenticationOptions('analyst@acme.test');
    await expect(
      service.verifyAssertion(
        signAssertion(second.challenge, { signCount: 5 }) as any,
        'AUTHENTICATION',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(credentials.rows[0].revokedAt).toBeInstanceOf(Date);
  });

  it('refuses a step-up asserted with another principal passkey', async () => {
    await registerPasskey();
    const options = await service.createStepUpOptions(PRINCIPAL_ID);

    await expect(
      service.verifyAssertion(
        signAssertion(options.challenge) as any,
        'STEP_UP',
        '22222222-2222-4222-8222-222222222222',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('issues an authentication challenge for an unknown email without disclosing it', async () => {
    const options =
      await service.createAuthenticationOptions('nobody@acme.test');

    expect(options.challenge).toEqual(expect.any(String));
    expect(options.allowCredentials).toEqual([]);
  });
});
