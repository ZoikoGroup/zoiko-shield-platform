import { Test, TestingModule } from '@nestjs/testing';
import { CollectorSignatureService } from './collector-signature.service';
import { DevCollectorSigner } from './dev-collector-signer.service';
import { COLLECTOR_SIGNER } from './collector-signer.interface';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * content_hash proves the bytes are unchanged; the collector signature is
 * what binds those bytes to who produced them (ZS-ENG-EVID-001 §10).
 */
describe('CollectorSignatureService', () => {
  let service: CollectorSignatureService;
  let prismaMock: any;
  const keys = new Map<string, any>();

  beforeEach(async () => {
    keys.clear();
    prismaMock = {
      signingKey: {
        upsert: jest.fn(async ({ where, create }: any) => {
          if (!keys.has(where.key_id)) keys.set(where.key_id, create);
          return keys.get(where.key_id);
        }),
        findUnique: jest.fn(
          async ({ where }: any) => keys.get(where.key_id) ?? null,
        ),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollectorSignatureService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: COLLECTOR_SIGNER, useClass: DevCollectorSigner },
      ],
    }).compile();

    service = module.get(CollectorSignatureService);
  });

  const payload = {
    contentHash: 'abc123',
    tenantId: 'tenant-a',
    sourceSystemId: 'shield-ingest',
    evidenceType: 'ALERT_CREATION',
    sourceObservedAt: new Date('2026-09-01T00:00:00.000Z'),
    collectorId: 'collector-1',
    collectorVersion: '1.2.3',
  };

  const asRecord = (signed: any, overrides: Record<string, unknown> = {}) => ({
    content_hash: payload.contentHash,
    tenant_id: payload.tenantId,
    source_system_id: payload.sourceSystemId,
    evidence_type: payload.evidenceType,
    source_observed_at: payload.sourceObservedAt,
    collector_id: payload.collectorId,
    collector_version: payload.collectorVersion,
    collector_signature: signed.signature,
    collector_signing_key_id: signed.signingKeyId,
    collector_nonce: signed.nonce,
    ...overrides,
  });

  it('signs and verifies a round trip, persisting only the public key', async () => {
    const signed = await service.sign(payload);
    expect(signed).not.toBeNull();

    await expect(service.verify(asRecord(signed))).resolves.toBe(true);

    const stored = keys.get(signed!.signingKeyId);
    expect(stored.public_key).toContain('BEGIN PUBLIC KEY');
    expect(JSON.stringify(stored)).not.toContain('PRIVATE KEY');
  });

  it('uses a fresh nonce per signature so two identical artifacts differ', async () => {
    const first = await service.sign(payload);
    const second = await service.sign(payload);
    expect(first!.nonce).not.toBe(second!.nonce);
    expect(first!.signature).not.toBe(second!.signature);
  });

  it('fails verification when the content hash is swapped under the signature', async () => {
    const signed = await service.sign(payload);
    await expect(
      service.verify(asRecord(signed, { content_hash: 'tampered' })),
    ).resolves.toBe(false);
  });

  it('fails verification when the collector identity is rewritten', async () => {
    const signed = await service.sign(payload);
    await expect(
      service.verify(asRecord(signed, { collector_id: 'someone-else' })),
    ).resolves.toBe(false);
  });

  it('fails verification when the nonce is replayed from another signature', async () => {
    const signed = await service.sign(payload);
    const other = await service.sign(payload);
    await expect(
      service.verify(asRecord(signed, { collector_nonce: other!.nonce })),
    ).resolves.toBe(false);
  });

  it('reports null (unsigned) rather than false for records with no signature', async () => {
    await expect(
      service.verify({
        content_hash: 'abc',
        tenant_id: 'tenant-a',
        source_system_id: 's',
        evidence_type: 'e',
        collector_signature: null,
        collector_signing_key_id: null,
        collector_nonce: null,
      }),
    ).resolves.toBeNull();
  });

  it('fails verification when the signing key is unknown', async () => {
    const signed = await service.sign(payload);
    keys.clear();
    await expect(service.verify(asRecord(signed))).resolves.toBe(false);
  });

  it('returns null instead of throwing when signing fails, so evidence is stored unsigned rather than falsely signed', async () => {
    const failing = await Test.createTestingModule({
      providers: [
        CollectorSignatureService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: COLLECTOR_SIGNER,
          useValue: {
            sign: jest.fn().mockRejectedValue(new Error('kms unreachable')),
            verify: jest.fn(),
          },
        },
      ],
    }).compile();

    const result = await failing
      .get(CollectorSignatureService)
      .sign(payload);
    expect(result).toBeNull();
  });
});
