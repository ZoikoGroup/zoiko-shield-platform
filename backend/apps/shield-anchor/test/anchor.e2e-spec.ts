import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ShieldAnchorModule } from '../src/shield-anchor.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { KafkaProducerService } from '../src/kafka/kafka-producer.service';
import { workloadAuthorizationHeaders } from '../../../libs/security/src/workload-token';

describe('ShieldAnchor Application Endpoints (e2e)', () => {
  let app: INestApplication;
  let prismaMock: any;
  let kafkaMock: any;
  const tenantId = 'tenant-test-e2e-anchor';

  beforeAll(async () => {
    process.env.SERVICE_NAME = 'shield-core';
    process.env.WORKLOAD_IDENTITY_DEV_SECRET = 'e2e-dev-secret-anchor-12345';
    process.env.NODE_ENV = 'test';

    prismaMock = {
      $transaction: jest.fn(async (cb) => {
        if (typeof cb === 'function') {
          return cb(prismaMock);
        }
        return Promise.all(cb);
      }),
      tenantAnchorHead: {
        findUnique: jest.fn().mockResolvedValue({
          tenant_id: tenantId,
          last_anchor_sequence: 0,
          version: 1,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn().mockResolvedValue({
          tenant_id: tenantId,
          sequence: 1,
          head_hash: 'head-hash-1',
          version: 1,
        }),
      },
      checkpoint: {
        create: jest.fn().mockResolvedValue({ id: 'chk-1' }),
        update: jest.fn().mockResolvedValue({ id: 'chk-1' }),
      },
      witnessReceipt: {
        create: jest.fn().mockResolvedValue({ id: 'wr-1' }),
      },
      evidenceRecord: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      signingKey: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'sk-1',
          key_id: 'key-dev-1',
          algorithm: 'ECDSA_P256',
          public_key: 'pubkey-abc',
          status: 'ACTIVE',
        }),
      },
    };

    kafkaMock = {
      emit: jest.fn().mockResolvedValue(true),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ShieldAnchorModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(KafkaProducerService)
      .useValue(kafkaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  const getHeaders = () => workloadAuthorizationHeaders('shield-anchor');

  it('1. GET / (Root health probe)', async () => {
    const res = await request(app.getHttpServer())
      .get('/')
      .set(getHeaders())
      .expect(200);
    expect(res.text).toContain('shield-anchor online');
  });

  it('2. GET /health (Readiness / Liveness signals)', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set(getHeaders())
      .expect(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.service).toBe('shield-anchor');
  });

  it('3. Security Boundary: Reject unauthenticated requests with 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/anchor/batches/seal')
      .send({ items: [] })
      .expect(401);
  });

  it('4. POST /api/v1/anchor/batches/seal (Batch Merkle epoch sealing)', async () => {
    const sampleLeaves = [
      {
        evidenceId: 'ev-1',
        tenantId,
        eventType: 'AUTHENTICATION_EVENT',
        payloadDigest: 'sha256-digest-alpha-001',
        timestamp: new Date().toISOString(),
      },
      {
        evidenceId: 'ev-2',
        tenantId,
        eventType: 'PRIVILEGE_ELEVATION',
        payloadDigest: 'sha256-digest-beta-002',
        timestamp: new Date().toISOString(),
      },
    ];

    const res = await request(app.getHttpServer())
      .post('/api/v1/anchor/batches/seal')
      .set(getHeaders())
      .send({ items: sampleLeaves })
      .expect(201);

    expect(res.body).toBeDefined();
    expect(res.body.merkleRoot).toBeDefined();
    expect(res.body.epochNumber).toBeDefined();
    expect(res.body.leafCount).toBe(2);

    const epochNum = res.body.epochNumber;

    // Verify receipt lookup
    const receiptRes = await request(app.getHttpServer())
      .get(`/api/v1/anchor/receipts/${epochNum}`)
      .set(getHeaders())
      .expect(200);

    expect(receiptRes.body.merkleRoot).toBe(res.body.merkleRoot);

    // Fetch inclusion proof for index 0
    const proofRes = await request(app.getHttpServer())
      .get(`/api/v1/anchor/proofs/${epochNum}/0`)
      .set(getHeaders())
      .expect(200);

    expect(proofRes.body.leafIndex).toBe(0);
    expect(proofRes.body.merkleRoot).toBe(res.body.merkleRoot);

    // Verify inclusion proof endpoint
    const verifyRes = await request(app.getHttpServer())
      .post('/api/v1/anchor/proofs/verify')
      .set(getHeaders())
      .send(proofRes.body)
      .expect(201);

    expect(verifyRes.body.valid).toBe(true);
  });

  it('5. POST /internal/v1/checkpoints (Request checkpoint for ledger head)', async () => {
    const res = await request(app.getHttpServer())
      .post('/internal/v1/checkpoints')
      .set(getHeaders())
      .send({
        tenantId,
        ledgerSequence: 10,
        ledgerHeadHash: 'a'.repeat(64),
        packageId: 'pkg-compliance-2026',
        packageVersion: 1,
        manifestCoreHash: 'b'.repeat(64),
      })
      .expect(201);

    expect(res.body.data).toBeDefined();
  });
});
