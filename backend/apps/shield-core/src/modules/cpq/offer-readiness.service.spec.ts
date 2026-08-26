import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { OfferReadinessService } from './offer-readiness.service';

describe('OfferReadinessService (Category I regional CPQ readiness)', () => {
  let service: OfferReadinessService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      product: { findFirst: jest.fn(), findUnique: jest.fn() },
      cpqOfferReadiness: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfferReadinessService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get(OfferReadinessService);
  });

  const verifyInput = {
    catalogVersionId: '11111111-1111-4111-8111-111111111111',
    productId: '22222222-2222-4222-8222-222222222222',
    region: 'US',
    retentionProfiles: ['security-365d'],
    serviceTiers: ['STANDARD'],
    supportedConnectorKeys: ['edr-1'],
    obligationTypes: ['MONITORING'],
    serviceCapacityStatus: 'AVAILABLE',
    marketAvailabilityStatus: 'AVAILABLE',
    claimEligibilityStatus: 'ELIGIBLE',
    evidenceRefs: ['evidence://launch/us'],
  };

  const readyRecord = {
    id: 'ready-1',
    retention_profiles: '["security-365d"]',
    service_tiers: '["STANDARD"]',
    supported_connector_keys: '["edr-1"]',
    obligation_types: '["MONITORING"]',
    service_capacity_status: 'AVAILABLE',
    market_availability_status: 'AVAILABLE',
    claim_eligibility_status: 'ELIGIBLE',
  };

  it('appends the next immutable readiness version for a released approved product', async () => {
    prismaMock.product.findFirst.mockResolvedValue({
      id: verifyInput.productId,
      sku: 'MD-US',
      region_scope: '["US"]',
    });
    prismaMock.cpqOfferReadiness.findFirst.mockResolvedValue({ version: 2 });
    prismaMock.cpqOfferReadiness.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'ready-3', ...data }),
    );

    await service.verify(verifyInput, 'platform-reviewer');

    expect(prismaMock.cpqOfferReadiness.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        product_id: verifyInput.productId,
        region: 'US',
        version: 3,
        status: 'VERIFIED',
        verified_by: 'platform-reviewer',
        retention_profiles: '["security-365d"]',
        evidence_refs: '["evidence://launch/us"]',
      }),
    });
  });

  it('rejects readiness verification outside the product release region', async () => {
    prismaMock.product.findFirst.mockResolvedValue({
      id: verifyInput.productId,
      sku: 'MD-US',
      region_scope: '["GB"]',
    });

    await expect(
      service.verify(verifyInput, 'platform-reviewer'),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.cpqOfferReadiness.create).not.toHaveBeenCalled();
  });

  it('blocks quotes when capacity, market or claims readiness is not permissive', async () => {
    prismaMock.cpqOfferReadiness.findFirst.mockResolvedValue({
      ...readyRecord,
      service_capacity_status: 'LIMITED',
    });

    await expect(
      service.assertReady({
        catalogVersionId: verifyInput.catalogVersionId,
        productId: verifyInput.productId,
        region: 'US',
        retentionProfile: 'security-365d',
        serviceTier: 'STANDARD',
        connectorDependencies: ['edr-1'],
        obligations: ['MONITORING'],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('blocks a quote configuration not enumerated by the exact readiness receipt', async () => {
    prismaMock.cpqOfferReadiness.findFirst.mockResolvedValue(readyRecord);

    await expect(
      service.assertReady({
        catalogVersionId: verifyInput.catalogVersionId,
        productId: verifyInput.productId,
        region: 'US',
        retentionProfile: 'security-7y',
        serviceTier: 'STANDARD',
        connectorDependencies: ['edr-1'],
        obligations: ['MONITORING'],
      }),
    ).rejects.toThrow('retention:security-7y');
  });

  it('returns the exact current record when every controlled dimension is supported', async () => {
    prismaMock.cpqOfferReadiness.findFirst.mockResolvedValue(readyRecord);

    await expect(
      service.assertReady({
        catalogVersionId: verifyInput.catalogVersionId,
        productId: verifyInput.productId,
        region: 'US',
        retentionProfile: 'security-365d',
        serviceTier: 'STANDARD',
        connectorDependencies: ['edr-1'],
        obligations: ['MONITORING'],
      }),
    ).resolves.toBe(readyRecord);
  });
});
