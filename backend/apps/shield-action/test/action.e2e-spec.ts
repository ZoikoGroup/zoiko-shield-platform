import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ShieldActionModule } from '../src/shield-action.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { KafkaProducerService } from '../src/kafka/kafka-producer.service';
import { KafkaConsumerService } from '../src/kafka/kafka-consumer.service';
import { ShieldCoreClient } from '../src/internal-client/shield-core.client';
import { workloadAuthorizationHeaders } from '../../../libs/security/src/workload-token';

describe('ShieldAction Application Endpoints (e2e)', () => {
  let app: INestApplication;
  let prismaMock: any;
  let kafkaMock: any;
  const tenantId = 'tenant-test-e2e-action';

  beforeAll(async () => {
    process.env.SERVICE_NAME = 'shield-core';
    process.env.WORKLOAD_IDENTITY_DEV_SECRET = 'e2e-dev-secret-action-12345';
    process.env.NODE_ENV = 'test';

    prismaMock = {
      actionProposal: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'prop-1',
          tenant_id: tenantId,
          action_type: 'QUARANTINE_HOST',
          target_resource: 'host-10.0.1.45',
          status: 'PENDING_APPROVAL',
        }),
        update: jest.fn().mockResolvedValue({ id: 'prop-1', status: 'EXECUTED' }),
      },
      actionReceipt: {
        create: jest.fn().mockResolvedValue({
          id: 'rcpt-1',
          tenant_id: tenantId,
          action_type: 'QUARANTINE_HOST',
          target_resource: 'host-10.0.1.45',
          status: 'SUCCESS',
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'rcpt-1',
          tenant_id: tenantId,
          action_type: 'QUARANTINE_HOST',
          target_resource: 'host-10.0.1.45',
          status: 'SUCCESS',
        }),
      },
      actionRollback: {
        create: jest.fn().mockResolvedValue({
          id: 'rb-1',
          tenant_id: tenantId,
          status: 'COMPLETED',
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'rb-1',
          tenant_id: tenantId,
          status: 'COMPLETED',
        }),
      },
      freeze: {
        create: jest.fn().mockResolvedValue({
          id: 'frz-1',
          tenant_id: tenantId,
          scope: 'TENANT',
          reason: 'Active ransomware detected',
          active_from: new Date(),
        }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    kafkaMock = {
      emit: jest.fn().mockResolvedValue(true),
    };

    const kafkaConsumerMock = {
      subscribe: jest.fn().mockResolvedValue(undefined),
      registerHandler: jest.fn(),
      onApplicationBootstrap: jest.fn().mockResolvedValue(undefined),
      onModuleDestroy: jest.fn().mockResolvedValue(undefined),
    };

    const shieldCoreClientMock = {
      getAuthorizationContext: jest.fn().mockResolvedValue({
        tenantId,
        environmentId: 'prod',
        proposalId: 'prop-1',
        actionType: 'QUARANTINE_HOST',
        targetType: 'HOST',
        targetId: 'host-10.0.1.45',
        authorityLevel: 'R1',
        proposalStatus: 'APPROVED',
        approval: {
          approvalId: 'app-1',
          decision: 'PERMIT',
          approverId: 'approver-1',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        },
        policyVersion: '1.0.0',
        authorizationDecisionId: 'authz-dec-1',
        entitlementAllowed: true,
        targetState: {},
        proposalVersion: 1,
        approvedMaterialHash: 'hash-abc',
        correlationId: 'corr-sim-101',
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ShieldActionModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(KafkaProducerService)
      .useValue(kafkaMock)
      .overrideProvider(KafkaConsumerService)
      .useValue(kafkaConsumerMock)
      .overrideProvider(ShieldCoreClient)
      .useValue(shieldCoreClientMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  const getHeaders = () => workloadAuthorizationHeaders('shield-action');

  it('1. GET / (Root health probe)', async () => {
    const res = await request(app.getHttpServer())
      .get('/')
      .set(getHeaders())
      .expect(200);
    expect(res.text).toContain('shield-action online');
  });

  it('2. GET /health (Readiness / Liveness signals)', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set(getHeaders())
      .expect(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.service).toBe('shield-action');
  });

  it('3. Security Boundary: Reject unauthenticated requests with 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/actions/simulate')
      .send({ tenantId, proposalId: 'prop-1', correlationId: 'corr-100' })
      .expect(401);
  });

  it('4. POST /api/v1/actions/simulate (Dry-run proposal simulation)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/actions/simulate')
      .set(getHeaders())
      .send({
        tenantId,
        proposalId: 'prop-1',
        correlationId: 'corr-sim-101',
      })
      .expect(201);

    expect(res.body).toBeDefined();
  });

  it('5. POST /api/v1/actions/freeze (Emergency tenant action freeze)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/actions/freeze')
      .set(getHeaders())
      .send({
        tenantId,
        scope: 'TENANT',
        reason: 'Active ransomware detected',
        actorId: 'sec-lead-01',
        durationMinutes: 60,
      })
      .expect(201);

    expect(res.body).toBeDefined();
  });

  it('6. POST /api/v1/action/approvals/two-man/submit & approve (Dual custody quorum)', async () => {
    const submitRes = await request(app.getHttpServer())
      .post('/api/v1/action/approvals/two-man/submit')
      .set(getHeaders())
      .send({
        tenantId,
        initiatorId: 'analyst-alpha',
        proposalId: 'prop-two-man-1',
        actionType: 'REVOKE_IAM_SESSION',
        targetResource: 'arn:aws:iam::123456789012:role/Admin',
        authorityLevel: 'R2',
        rationale: 'Privileged identity compromise containment',
        ttlMinutes: 30,
      })
      .expect(201);

    const ticketId = submitRes.body.ticketId || submitRes.body.id || 'ticket-123';

    await request(app.getHttpServer())
      .post('/api/v1/action/approvals/two-man/approve')
      .set(getHeaders())
      .send({
        tenantId,
        ticketId,
        approverId: 'senior-lead-beta',
        approvalNotes: 'Validated with incident commander',
        fido2MfaToken: 'webauthn-proof-pass',
      })
      .expect(201);
  });

  it('7. POST /api/v1/action/locks/acquire & release (Distributed action concurrency lock)', async () => {
    const lockRes = await request(app.getHttpServer())
      .post('/api/v1/action/locks/acquire')
      .set(getHeaders())
      .send({
        tenantId,
        actionType: 'ISOLATE_HOST',
        targetResource: 'host-192.168.1.10',
        idempotencyKey: 'idemp-lock-001',
        ownerId: 'worker-node-1',
        ttlSeconds: 60,
      })
      .expect(201);

    const lockToken = lockRes.body.lockToken || 'token-fallback';

    await request(app.getHttpServer())
      .post('/api/v1/action/locks/release')
      .set(getHeaders())
      .send({
        tenantId,
        actionType: 'ISOLATE_HOST',
        targetResource: 'host-192.168.1.10',
        lockToken,
      })
      .expect(201);
  });
});
