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

    const aiIncidentRows = new Map<string, any>();

    prismaMock = {
      aiIncident: {
        create: jest.fn().mockImplementation(({ data }: any) => {
          const row = {
            affected_model: null,
            affected_prompt_key: null,
            affected_tool: null,
            kill_switch_active: false,
            kill_switch_details: null,
            fallback_active: false,
            fallback_details: null,
            rca_summary: null,
            rca_details: null,
            decision_envelope_id: null,
            decision_envelope: null,
            resolution_summary: null,
            resolved_at: null,
            closed_at: null,
            timeline: '[]',
            ...data,
          };
          aiIncidentRows.set(row.id, row);
          return Promise.resolve(row);
        }),
        update: jest.fn().mockImplementation(({ where, data }: any) => {
          const existing = aiIncidentRows.get(where.id);
          const updated = { ...existing, ...data };
          aiIncidentRows.set(where.id, updated);
          return Promise.resolve(updated);
        }),
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(aiIncidentRows.get(where.id) ?? null);
        }),
        findMany: jest.fn().mockImplementation(({ where }: any) => {
          const rows = [...aiIncidentRows.values()].filter((row) => {
            if (where?.tenant_id && row.tenant_id !== where.tenant_id) {
              return false;
            }
            if (where?.status && row.status !== where.status) {
              return false;
            }
            if (where?.severity && row.severity !== where.severity) {
              return false;
            }
            if (where?.category && row.category !== where.category) {
              return false;
            }
            return true;
          });
          rows.sort(
            (a, b) =>
              new Date(b.declared_at).getTime() -
              new Date(a.declared_at).getTime(),
          );
          return Promise.resolve(rows);
        }),
        deleteMany: jest.fn().mockImplementation(() => {
          aiIncidentRows.clear();
          return Promise.resolve({ count: 0 });
        }),
      },
      aiReviewEnvelope: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
      },
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

  describe('AI Incident Lifecycle Management (§23 E2E)', () => {
    let incidentId: string;

    it('7. POST /api/v1/ai/incidents (Declare incident)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/incidents')
        .set(getHeaders())
        .set('x-tenant-id', tenantId)
        .send({
          title: 'Model Hallucination in Firewall Synthesis',
          category: 'MODEL_HALLUCINATION',
          severity: 'SEV2_HIGH',
          description: 'Model recommended opening port 22 to 0.0.0.0/0',
          affectedModel: 'claude-3-5-sonnet',
        })
        .expect(201);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.status).toBe('DECLARED');
      incidentId = res.body.data.id;
    });

    it('8. GET /api/v1/ai/incidents (List incidents)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ai/incidents')
        .set(getHeaders())
        .set('x-tenant-id', tenantId)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('9. POST /api/v1/ai/incidents/:id/contain (Engage KillSwitch)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/ai/incidents/${incidentId}/contain`)
        .set(getHeaders())
        .set('x-tenant-id', tenantId)
        .send({
          reason: 'Emergency containment for model route',
          killSwitchScope: 'MODEL_ROUTE',
          targetId: 'claude-3-5-sonnet',
          containedBy: 'soc-lead-bob',
        })
        .expect(200);

      expect(res.body.data.status).toBe('CONTAINED_KILL_SWITCH');
      expect(res.body.data.killSwitchActive).toBe(true);
    });

    it('10. POST /api/v1/ai/incidents/:id/fallback (Activate Fallback)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/ai/incidents/${incidentId}/fallback`)
        .set(getHeaders())
        .set('x-tenant-id', tenantId)
        .send({
          fallbackStrategy: 'DETERMINISTIC_RULES',
          fallbackNotes: 'Routing to deterministic regex generator',
        })
        .expect(200);

      expect(res.body.data.status).toBe('FALLBACK_ACTIVE');
    });

    it('11. POST /api/v1/ai/incidents/:id/rca (Complete RCA)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/ai/incidents/${incidentId}/rca`)
        .set(getHeaders())
        .set('x-tenant-id', tenantId)
        .send({
          rootCauseSummary:
            'Few-shot prompt sample contained conflicting firewall rule snippet',
          contributingFactors: ['Outdated few-shot example'],
          preventativeActions: ['Updated gold-set prompt template'],
        })
        .expect(200);

      expect(res.body.data.status).toBe('ROOT_CAUSE_ANALYZED');
    });

    it('12. POST /api/v1/ai/incidents/:id/resolve (Resolve Incident)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/ai/incidents/${incidentId}/resolve`)
        .set(getHeaders())
        .set('x-tenant-id', tenantId)
        .send({
          resolutionSummary:
            'Updated prompt template verified and redeployed to production',
          disengageKillSwitch: true,
          resolvedBy: 'soc-lead-bob',
        })
        .expect(200);

      expect(res.body.data.status).toBe('RESOLVED');
      expect(res.body.data.killSwitchActive).toBe(false);
    });

    it('13. POST /api/v1/ai/incidents/:id/close (Close Incident)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/ai/incidents/${incidentId}/close`)
        .set(getHeaders())
        .set('x-tenant-id', tenantId)
        .send({})
        .expect(200);

      expect(res.body.data.status).toBe('CLOSED');
      expect(res.body.data.closedAt).toBeDefined();
    });

    it('14. GET /api/v1/ai/incidents/metrics (Incident Metrics)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ai/incidents/metrics')
        .set(getHeaders())
        .set('x-tenant-id', tenantId)
        .expect(200);

      expect(res.body.data.totalIncidents).toBeGreaterThan(0);
    });
  });
});
