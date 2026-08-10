import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ShieldIngestModule } from './../src/shield-ingest.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { KafkaProducerService } from '../src/kafka/kafka.producer.service';

describe('ShieldIngest Application Endpoints (e2e)', () => {
  let app: INestApplication;
  let prismaMock: any;
  let kafkaMock: any;

  beforeAll(async () => {
    prismaMock = {
      connectorInstance: {
        findUnique: jest.fn().mockResolvedValue({ id: 'conn-1', tenant_id: 'tenant-1', authentication_type: 'WEBHOOK', status: 'ACTIVE' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'conn-1', name: 'Entra Connector' }]),
        create: jest.fn().mockResolvedValue({ id: 'conn-1', name: 'New Connector' }),
        update: jest.fn().mockResolvedValue({ id: 'conn-1', status: 'ACTIVE' }),
        count: jest.fn().mockResolvedValue(1),
      },
      rawEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'raw-1',
          tenant_id: 'tenant-1',
          environment_id: 'prod',
          connector_id: 'conn-1',
          source_type: 'WEBHOOK',
          payload_hash: 'hash123',
          processing_status: 'ACCEPTED',
          received_at: new Date(),
        }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(10),
      },
      normalizedEvent: {
        findMany: jest.fn().mockResolvedValue([{ id: 'norm-1', event_class: 'AUTHENTICATION' }]),
        findUnique: jest.fn().mockResolvedValue({ id: 'norm-1', tenant_id: 'tenant-1', event_class: 'AUTHENTICATION' }),
        count: jest.fn().mockResolvedValue(5),
      },
      quarantinedEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      asset: {
        findMany: jest.fn().mockResolvedValue([{ id: 'asset-1', name: 'Host 1' }]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'asset-1', name: 'Host 1' }),
        update: jest.fn().mockResolvedValue({ id: 'asset-1' }),
      },
      identityEntity: {
        findMany: jest.fn().mockResolvedValue([{ id: 'id-1', email: 'user@example.com' }]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'id-1', email: 'user@example.com' }),
        update: jest.fn().mockResolvedValue({ id: 'id-1' }),
      },
      detectionRule: {
        create: jest.fn().mockResolvedValue({ id: 'rule-1', name: 'Rule 1', status: 'ACTIVE' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'rule-1', name: 'Rule 1', status: 'ACTIVE' }]),
        findUnique: jest.fn().mockResolvedValue({
          id: 'rule-1',
          name: 'Rule 1',
          current_version: 1,
          condition_definition: JSON.stringify({ ruleType: 'MATCH', conditions: [] }),
          required_fields: '[]',
        }),
        update: jest.fn().mockResolvedValue({ id: 'rule-1', status: 'ACTIVE' }),
      },
      detectionRun: {
        create: jest.fn().mockResolvedValue({ id: 'run-1', result: 'MATCHED' }),
      },
      alert: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'alert-1', title: 'Alert 1', status: 'NEW' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'alert-1', title: 'Alert 1', status: 'NEW', severity: 'HIGH' }]),
        findUnique: jest.fn().mockResolvedValue({ id: 'alert-1', title: 'Alert 1', status: 'NEW' }),
        update: jest.fn().mockResolvedValue({ id: 'alert-1', status: 'ACKNOWLEDGED' }),
        count: jest.fn().mockResolvedValue(1),
      },
      resourceObservation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'res-1', coverage_state: 'DISCOVERED' }),
        update: jest.fn().mockResolvedValue({ id: 'res-1' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'res-1', canonical_resource_id: 'host-1' }]),
      },
      usageRecord: {
        create: jest.fn().mockResolvedValue({ id: 'use-1', accepted_quantity: 1, billable_quantity: 1 }),
        findMany: jest.fn().mockResolvedValue([{ id: 'use-1', accepted_quantity: 1 }]),
      },
      case: {
        create: jest.fn().mockResolvedValue({ id: 'case-1', title: 'Case 1', status: 'NEW' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'case-1', tenant_id: 'tenant-1', title: 'Case 1', status: 'NEW', caseTimelines: [] }),
        findMany: jest.fn().mockResolvedValue([{ id: 'case-1', title: 'Case 1', status: 'NEW', severity: 'HIGH' }]),
        update: jest.fn().mockResolvedValue({ id: 'case-1', status: 'TRIAGED' }),
        count: jest.fn().mockResolvedValue(1),
      },
      caseTimeline: {
        create: jest.fn().mockResolvedValue({ id: 'tl-1', event_type: 'CREATED' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'tl-1', event_type: 'CREATED' }]),
      },
      caseDecision: {
        create: jest.fn().mockResolvedValue({ id: 'dec-1', decision_type: 'TRIAGE_DECISION' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'dec-1', decision_type: 'TRIAGE_DECISION' }]),
      },
      evidenceRecord: {
        create: jest.fn().mockResolvedValue({ id: 'ev-1', sha256_hash: 'abc123hash', raw_content: 'sample log content' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'ev-1', sha256_hash: 'b14a7b8059d9c055954c92674ce6003202de35aa79e0a4fc018a7c265d361d42', raw_content: 'sample log content' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'ev-1', sha256_hash: 'abc123hash' }]),
      },
      controlObjective: {
        create: jest.fn().mockResolvedValue({ id: 'ctrl-1', code: 'MFA_ENFORCED' }),
        upsert: jest.fn().mockResolvedValue({ id: 'ctrl-1', code: 'MFA_ENFORCED' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'ctrl-1', code: 'MFA_ENFORCED' }]),
        findUnique: jest.fn().mockResolvedValue({ id: 'ctrl-1', tenant_id: 'tenant-1', code: 'MFA_ENFORCED' }),
      },
      controlTestRun: {
        create: jest.fn().mockResolvedValue({ id: 'run-1', result: 'PASS' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'run-1', result: 'PASS' }]),
      },
      assuranceReview: {
        create: jest.fn().mockResolvedValue({ id: 'rev-1', overall_score: 100.0, period_name: '2026-Q3 Review' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'rev-1', overall_score: 100.0, period_name: '2026-Q3 Review' }]),
      },
      vCISOReflection: {
        create: jest.fn().mockResolvedValue({ id: 'ref-1', category: 'STRATEGIC_RISK', title: 'MFA Enforcement Plan' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'ref-1', category: 'STRATEGIC_RISK', title: 'MFA Enforcement Plan' }]),
      },
      claimEvaluation: {
        create: jest.fn().mockResolvedValue({ id: 'eval-1', status: 'QUALIFIED', claim_key: 'CLAIM_15MIN_RESPONSE' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'eval-1', status: 'QUALIFIED', claim_key: 'CLAIM_15MIN_RESPONSE' }]),
      },
    };

    kafkaMock = {
      emit: jest.fn().mockResolvedValue(true),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ShieldIngestModule],
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
    await app.close();
  });

  it('1. GET / (Health check)', () => {
    return request(app.getHttpServer()).get('/').expect(200);
  });

  it('2. POST /api/v1/ingestion/webhooks/:connectorId (Webhook Ingestion)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/ingestion/webhooks/conn-1')
      .send({ eventId: 'evt-100', eventType: 'user.login' })
      .expect(202);
  });

  it('3. GET /api/v1/connector-types (Connector types catalog)', () => {
    return request(app.getHttpServer()).get('/api/v1/connector-types').expect(200);
  });

  it('4. GET /api/v1/connectors (List connectors)', () => {
    return request(app.getHttpServer()).get('/api/v1/connectors').expect(200);
  });

  it('5. GET /api/v1/connectors/conn-1 (Get connector detail)', () => {
    return request(app.getHttpServer()).get('/api/v1/connectors/conn-1').expect(200);
  });

  it('6. GET /api/v1/events (List normalized events)', () => {
    return request(app.getHttpServer()).get('/api/v1/events').expect(200);
  });

  it('7. GET /api/v1/quarantine (List quarantined events)', () => {
    return request(app.getHttpServer()).get('/api/v1/quarantine').expect(200);
  });

  it('8. GET /api/v1/context/assets (List security assets)', () => {
    return request(app.getHttpServer()).get('/api/v1/context/assets').expect(200);
  });

  it('9. GET /api/v1/context/identities (List identity entities)', () => {
    return request(app.getHttpServer()).get('/api/v1/context/identities').expect(200);
  });

  it('10. GET /api/v1/detections (List detection rules)', () => {
    return request(app.getHttpServer()).get('/api/v1/detections').expect(200);
  });

  it('11. GET /api/v1/alerts (List alerts)', () => {
    return request(app.getHttpServer()).get('/api/v1/alerts').expect(200);
  });

  it('12. GET /api/v1/metering/usage (Telemetry usage summary)', () => {
    return request(app.getHttpServer()).get('/api/v1/metering/usage').expect(200);
  });

  it('13. GET /api/v1/metering/resources (Protected resource inventory)', () => {
    return request(app.getHttpServer()).get('/api/v1/metering/resources').expect(200);
  });

  it('14. POST /api/v1/cases (Create investigation case)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/cases')
      .send({ title: 'New Case' })
      .expect(201);
  });

  it('15. GET /api/v1/cases (List cases)', () => {
    return request(app.getHttpServer()).get('/api/v1/cases').expect(200);
  });

  it('16. GET /api/v1/cases/case-1 (Get case detail)', () => {
    return request(app.getHttpServer()).get('/api/v1/cases/case-1').expect(200);
  });

  it('17. POST /api/v1/cases/case-1/transition (Transition case state)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/cases/case-1/transition')
      .send({ targetStatus: 'TRIAGED' })
      .expect(201);
  });

  it('18. GET /api/v1/cases/case-1/timeline (Query case timeline)', () => {
    return request(app.getHttpServer()).get('/api/v1/cases/case-1/timeline').expect(200);
  });

  it('19. POST /api/v1/cases/case-1/decisions (Record human decision)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/cases/case-1/decisions')
      .send({ decisionType: 'TRIAGE_DECISION', decision: 'Escalate to Tier 2' })
      .expect(201);
  });

  it('20. GET /api/v1/cases/case-1/decisions (List human decisions for case)', () => {
    return request(app.getHttpServer()).get('/api/v1/cases/case-1/decisions').expect(200);
  });

  it('21. GET /api/v1/dashboard/overview (Tenant dashboard overview)', () => {
    return request(app.getHttpServer()).get('/api/v1/dashboard/overview').expect(200);
  });

  it('22. GET /api/v1/dashboard/connectors (Tenant connector metrics)', () => {
    return request(app.getHttpServer()).get('/api/v1/dashboard/connectors').expect(200);
  });

  it('23. GET /api/v1/dashboard/events (Tenant event metrics)', () => {
    return request(app.getHttpServer()).get('/api/v1/dashboard/events').expect(200);
  });

  it('24. GET /api/v1/dashboard/alerts (Tenant alert metrics)', () => {
    return request(app.getHttpServer()).get('/api/v1/dashboard/alerts').expect(200);
  });

  it('25. GET /api/v1/dashboard/cases (Tenant case metrics)', () => {
    return request(app.getHttpServer()).get('/api/v1/dashboard/cases').expect(200);
  });

  it('26. POST /api/v1/evidence (Store evidence record with SHA-256 hash)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/evidence')
      .send({ evidenceType: 'LOG_EXCERPT', title: 'Audit Evidence', rawContent: 'sample log content' })
      .expect(201);
  });

  it('27. GET /api/v1/evidence (List evidence records for tenant)', () => {
    return request(app.getHttpServer()).get('/api/v1/evidence').expect(200);
  });

  it('28. GET /api/v1/evidence/ev-1 (Get evidence record details)', () => {
    return request(app.getHttpServer()).get('/api/v1/evidence/ev-1').expect(200);
  });

  it('29. POST /api/v1/evidence/ev-1/verify (Verify cryptographic SHA-256 integrity)', () => {
    return request(app.getHttpServer()).post('/api/v1/evidence/ev-1/verify').expect(200);
  });

  it('30. POST /api/v1/controls/objectives (Create control objective)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/controls/objectives')
      .send({ code: 'MFA_ENFORCED', name: 'MFA Enforced', framework: 'SOC2' })
      .expect(201);
  });

  it('31. GET /api/v1/controls/objectives (List control objectives for tenant)', () => {
    return request(app.getHttpServer()).get('/api/v1/controls/objectives').expect(200);
  });

  it('32. POST /api/v1/controls/objectives/ctrl-1/evaluate (Run automated control test)', () => {
    return request(app.getHttpServer()).post('/api/v1/controls/objectives/ctrl-1/evaluate').expect(200);
  });

  it('33. GET /api/v1/controls/results (Query continuous control test results)', () => {
    return request(app.getHttpServer()).get('/api/v1/controls/results').expect(200);
  });

  it('34. POST /api/v1/assurance/reviews (Generate posture assurance review)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/assurance/reviews')
      .send({ periodName: '2026-Q3 Review' })
      .expect(201);
  });

  it('35. GET /api/v1/assurance/reviews (List assurance reviews for tenant)', () => {
    return request(app.getHttpServer()).get('/api/v1/assurance/reviews').expect(200);
  });

  it('36. GET /api/v1/assurance/posture (Get real-time executive posture summary)', () => {
    return request(app.getHttpServer()).get('/api/v1/assurance/posture').expect(200);
  });

  it('37. POST /api/v1/assurance/reflections (Create vCISO strategic reflection)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/assurance/reflections')
      .send({ category: 'STRATEGIC_RISK', title: 'MFA Roadmap', notes: 'Enforce MFA across admins' })
      .expect(201);
  });

  it('38. GET /api/v1/assurance/reflections (List vCISO strategic reflections)', () => {
    return request(app.getHttpServer()).get('/api/v1/assurance/reflections').expect(200);
  });

  it('39. POST /api/v1/sla/claims/evaluate (Evaluate SLA claim eligibility)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/sla/claims/evaluate')
      .send({ claimKey: 'CLAIM_15MIN_RESPONSE' })
      .expect(200);
  });

  it('40. GET /api/v1/sla/claims/evaluations (Query claim evaluation history)', () => {
    return request(app.getHttpServer()).get('/api/v1/sla/claims/evaluations').expect(200);
  });

  it('41. GET /api/v1/sla/performance (Query SLA performance and uptime metrics)', () => {
    return request(app.getHttpServer()).get('/api/v1/sla/performance').expect(200);
  });
});
