import { Test, TestingModule } from '@nestjs/testing';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('CatalogService (ADR-06 & P0 Blockers)', () => {
  let service: CatalogService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      catalogVersion: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      product: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      priceBook: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<CatalogService>(CatalogService);
  });

  it('should create catalog version in DRAFT state', async () => {
    prismaMock.catalogVersion.create.mockResolvedValue({
      id: 'cat-1',
      version_label: 'v1.0-design-partner',
      status: 'DRAFT',
    });

    const result = await service.createCatalogVersion({
      versionLabel: 'v1.0-design-partner',
    });

    expect(result.status).toBe('DRAFT');
    expect(prismaMock.catalogVersion.create).toHaveBeenCalled();
  });

  it('should fail closed (return null) if active price book is missing or not APPROVED', async () => {
    prismaMock.priceBook.findFirst.mockResolvedValue(null);

    const priceBook = await service.getActivePriceBook('SKU-DEFENSE-01');

    expect(priceBook).toBeNull();
  });

  it('should return price book when APPROVED and effective date is valid', async () => {
    const mockPriceBook = {
      id: 'pb-1',
      unit_price: 150.0,
      status: 'APPROVED',
    };
    prismaMock.priceBook.findFirst.mockResolvedValue(mockPriceBook);

    const priceBook = await service.getActivePriceBook('SKU-DEFENSE-01');

    expect(priceBook).not.toBeNull();
    expect(priceBook?.unit_price).toBe(150.0);
  });
});
