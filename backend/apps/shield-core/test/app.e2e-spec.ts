import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ShieldCoreModule } from './../src/shield-core.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('ShieldCore Application Endpoints (e2e)', () => {
  let app: INestApplication;
  let prismaMock: any;

  beforeAll(async () => {
    prismaMock = {
      commercialAccount: {
        create: jest.fn().mockResolvedValue({
          id: 'comm-1',
          name: 'Acme Corp',
          status: 'ACTIVE',
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'comm-1',
          name: 'Acme Corp',
          status: 'ACTIVE',
          entitlements: [],
        }),
      },
      entitlement: {
        create: jest.fn().mockResolvedValue({
          id: 'ent-1',
          offer_type: 'MANAGED_DEFENSE',
          status: 'ACTIVE',
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'ent-1',
          offer_type: 'MANAGED_DEFENSE',
          status: 'ACTIVE',
          commercialAccount: { status: 'ACTIVE' },
        }),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'ent-1', offer_type: 'MANAGED_DEFENSE' }]),
      },
      claimRegister: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'claim-1',
          claim_key: 'CLAIM_24_7_SOC',
          version: 1,
          approved_wording: '24/7 Managed SOC',
          channels: JSON.stringify(['PRODUCT_UI']),
          scope: JSON.stringify({}),
          evidence_refs: JSON.stringify(['release-evidence-1']),
          prohibited_variants: JSON.stringify([]),
          limitations: JSON.stringify([]),
          required_offer_type: 'MANAGED_DEFENSE',
          sector_pack_key: null,
          evidence_max_age_hours: 24,
          status: 'APPROVED',
          effective_from: new Date('2026-01-01T00:00:00.000Z'),
          expires_at: new Date('2099-01-01T00:00:00.000Z'),
        }),
      },
      claimEligibility: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'eligibility-1' }),
      },
      claimEvaluation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'evaluation-1',
          evidence_ids: JSON.stringify(['evidence-1']),
          evaluated_at: new Date(),
        }),
      },
      evidenceRecord: {
        findMany: jest.fn().mockResolvedValue([{ id: 'evidence-1' }]),
      },
      catalogVersion: {
        create: jest.fn().mockResolvedValue({
          id: 'cat-1',
          version_label: 'v1.0',
          status: 'DRAFT',
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'cat-1',
          version_label: 'v1.0',
          status: 'DRAFT',
        }),
        update: jest
          .fn()
          .mockResolvedValue({ id: 'cat-1', status: 'APPROVED' }),
      },
      product: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'prod-1', sku: 'SKU-DEFENSE' }),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'prod-1', sku: 'SKU-DEFENSE' }]),
      },
      priceBook: {
        create: jest.fn().mockResolvedValue({
          id: 'pb-1',
          unit_price: 150.0,
          status: 'DRAFT',
        }),
        update: jest.fn().mockResolvedValue({ id: 'pb-1', status: 'APPROVED' }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'pb-1',
          unit_price: 150.0,
          status: 'APPROVED',
        }),
      },
      contract: {
        create: jest.fn().mockResolvedValue({ id: 'cnt-1', status: 'DRAFT' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'cnt-1',
          commercial_account_id: 'comm-1',
          status: 'DRAFT',
        }),
        update: jest.fn().mockResolvedValue({ id: 'cnt-1', status: 'QUOTED' }),
      },
      serviceObligation: {
        create: jest.fn().mockResolvedValue({
          id: 'ob-1',
          obligation_type: 'SOC_COVERAGE',
          status: 'NOT_DUE',
        }),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'ob-1', obligation_type: 'SOC_COVERAGE' }]),
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'ob-1', status: 'NOT_DUE' }),
        update: jest
          .fn()
          .mockResolvedValue({ id: 'ob-1', status: 'DELIVERED' }),
      },
      commercialInvoice: {
        create: jest.fn().mockResolvedValue({
          id: 'inv-1',
          total_amount: 500.0,
          status: 'DRAFT',
        }),
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'inv-1', status: 'DRAFT' }),
        update: jest.fn().mockResolvedValue({ id: 'inv-1', status: 'ISSUED' }),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'inv-1', total_amount: 500.0 }]),
      },
      commercialEvent: {
        create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      tenant: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'tenant-1', name: 'Tenant 1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation((cb) => cb(prismaMock)),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ShieldCoreModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
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

  it('2. POST /api/v1/commercial/accounts (Create commercial account)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/commercial/accounts')
      .send({ name: 'Acme Corp' })
      .expect(201);
  });

  it('3. GET /api/v1/commercial/accounts/comm-1 (Get commercial account)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/commercial/accounts/comm-1')
      .expect(200);
  });

  it('4. POST /api/v1/commercial/entitlements (Issue entitlement)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/commercial/entitlements')
      .send({
        commercialAccountId: 'comm-1',
        tenantId: 'tenant-1',
        offerType: 'MANAGED_DEFENSE',
      })
      .expect(201);
  });

  it('5. GET /api/v1/commercial/entitlements (List tenant entitlements)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/commercial/entitlements')
      .expect(200);
  });

  it('6. GET /api/v1/commercial/entitlements/check (Check entitlement)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/commercial/entitlements/check?offerType=MANAGED_DEFENSE')
      .expect(200);
  });

  it('7. GET /api/v1/commercial/claims/check (Check claim eligibility)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/commercial/claims/check?claimKey=CLAIM_24_7_SOC')
      .expect(200);
  });

  it('8. POST /api/v1/catalog/versions (Create catalog version)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/catalog/versions')
      .send({ versionLabel: 'v1.0' })
      .expect(201);
  });

  it('9. GET /api/v1/catalog/products (List approved catalog products)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/catalog/products')
      .expect(200);
  });

  it('10. POST /api/v1/commerce/contracts (Create contract)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/commerce/contracts')
      .send({
        commercialAccountId: 'comm-1',
        catalogVersionId: 'cat-1',
        termStart: new Date(),
        termEnd: new Date(),
        orderConfig: {},
      })
      .expect(201);
  });

  it('11. PATCH /api/v1/commerce/contracts/cnt-1/transition (Transition contract status)', () => {
    return request(app.getHttpServer())
      .patch('/api/v1/commerce/contracts/cnt-1/transition')
      .send({ targetStatus: 'QUOTED' })
      .expect(200);
  });

  it('12. POST /api/v1/obligations (Create service obligation)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/obligations')
      .send({ contractId: 'cnt-1', obligationType: 'SOC_COVERAGE' })
      .expect(201);
  });

  it('13. POST /api/v1/billing/invoices (Create draft invoice)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/billing/invoices')
      .send({
        commercialAccountId: 'comm-1',
        contractId: 'cnt-1',
        lineItems: [
          { sku: 'DEFENSE', amount: 500.0, description: 'Managed Defense' },
        ],
      })
      .expect(201);
  });
});
