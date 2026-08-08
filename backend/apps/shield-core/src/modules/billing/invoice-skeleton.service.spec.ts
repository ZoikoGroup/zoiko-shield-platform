import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceSkeletonService } from './invoice-skeleton.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictException } from '@nestjs/common';

describe('InvoiceSkeletonService (FIN-02 Immutability)', () => {
  let service: InvoiceSkeletonService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      commercialInvoice: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceSkeletonService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<InvoiceSkeletonService>(InvoiceSkeletonService);
  });

  it('should create draft invoice with calculated line items total', async () => {
    prismaMock.commercialInvoice.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'inv-1', ...data }),
    );

    const invoice = await service.createDraftInvoice({
      commercialAccountId: 'comm-1',
      contractId: 'cnt-1',
      lineItems: [
        { sku: 'DEFENSE', amount: 500.0, description: 'Managed Defense' },
        { sku: 'ASSURANCE', amount: 300.0, description: 'Continuous Assurance' },
      ],
    });

    expect(invoice.total_amount).toBe(800.0);
    expect(invoice.status).toBe('DRAFT');
  });

  it('should reject re-issuing an invoice past DRAFT status', async () => {
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      status: 'ISSUED',
    });

    await expect(service.issueInvoice('inv-1')).rejects.toThrow(ConflictException);
  });
});
