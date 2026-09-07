import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ShieldAiModule } from '../src/shield-ai.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { KafkaProducerService } from '../src/kafka/kafka-producer.service';
import { workloadAuthorizationHeaders } from '../../../libs/security/src/workload-token';

describe('ShieldAi Application Endpoints (e2e)', () => {
  let app: INestApplication;
  let prismaMock: any;
  let kafkaMock: any;
  const tenantId = 'tenant-test-e2e-ai';

  beforeAll(async () => {
    process.env.SERVICE_NAME = 'shield-core';
    process.env.WORKLOAD_IDENTITY_DEV_SECRET = 'e2e-dev-secret-ai-12345';
    process.env.NODE_ENV = 'test';

    prismaMock = {
      aiDecisionRecord: {
        create: jest.fn().mockResolvedValue({
          id: 'dec-1',
          tenant_id: tenantId,
          use_case: 'CASE_SUMMARY',
          status: 'COMPLETED',
        }),
      },
      aiKillSwitch: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'ks-1',
          tenant_id: tenantId,
          active: true,
        }),
      },
      aiModelQuota: {
        findUnique: jest.fn().mockResolvedValue({
          tenant_id: tenantId,
          monthly_budget_usd: 1000,
          current_spend_usd: 25,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    kafkaMock = {
      emit: jest.fn().mockResolvedValue(true),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ShieldAiModule],
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

  const getHeaders = () => workloadAuthorizationHeaders('shield-ai');

  it('1. GET / (Root health probe)', async () => {
    const res = await request(app.getHttpServer())
      .get('/')
      .set(getHeaders())
      .expect(200);
    expect(res.text).toContain('shield-ai online');
  });

  it('2. GET /health (Readiness / Liveness signals)', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set(getHeaders())
      .expect(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.service).toBe('shield-ai');
  });

  it('3. Security Boundary: Reject unauthenticated requests with 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/ai/copilot/hunt')
      .send({
        tenantId,
        analystId: 'analyst-1',
        query: 'Analyze high volume egress on port 443',
      })
      .expect(401);
  });

  it('4. POST /api/v1/ai/copilot/hunt (Threat hunting copilot)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ai/copilot/hunt')
      .set(getHeaders())
      .send({
        tenantId,
        analystId: 'analyst-1',
        caseId: 'case-99',
        query: 'Identify suspicious PowerShell encoded commands',
      })
      .expect(201);

    expect(res.body).toBeDefined();
    expect(res.body.tenantId).toBe(tenantId);
  });

  it('5. POST /api/v1/ai/red-team/simulate-scenario (Adversarial attack path simulation)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ai/red-team/simulate-scenario')
      .set(getHeaders())
      .send({
        tenantId,
        scenarioType: 'RANSOMWARE_STAGING',
        targetHost: 'srv-finance-01',
        intensityLevel: 'MEDIUM',
      })
      .expect(201);

    expect(res.body).toBeDefined();
    expect(res.body.scenarioType).toBe('RANSOMWARE_STAGING');
  });

  it('6. POST /api/v1/ai/rca/generate (Incident RCA & forensic timeline summary)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ai/rca/generate')
      .set(getHeaders())
      .send({
        incidentId: 'inc-2026-001',
        tenantId,
        title: 'Lateral Movement via WMI',
        severity: 'HIGH',
        events: [
          {
            eventId: 'evt-1',
            timestamp: new Date().toISOString(),
            source: 'crowdstrike',
            eventType: 'ProcessRollup2',
            targetResource: 'srv-dc-01',
            details: { cmd: 'wmic process call create' },
          },
        ],
      })
      .expect(201);

    expect(res.body).toBeDefined();
    expect(res.body.incidentId).toBe('inc-2026-001');
  });
});
