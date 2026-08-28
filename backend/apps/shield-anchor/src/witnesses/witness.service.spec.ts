import { Test, TestingModule } from '@nestjs/testing';
import { WitnessService } from './witness.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockWitnessProvider } from './mock-witness-provider.service';
import { HttpWitnessProvider } from './http-witness-provider.service';

describe('WitnessService', () => {
  let service: WitnessService;
  let prisma: PrismaService;
  let mockWitnessProvider: MockWitnessProvider;
  let httpWitnessProvider: HttpWitnessProvider;

  const mockPrismaService = {
    witnessReceipt: {
      create: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ ...data })),
    },
  };

  const mockMockWitnessProvider = {
    attest: jest.fn().mockResolvedValue({
      witnessId: 'mock-wit-1',
      witnessType: 'MOCK',
      receiptHash: 'hash-mock-1',
      signature: 'sig-mock-1',
      publicKey: 'pub-mock-1',
      algorithm: 'Ed25519',
    }),
  };

  const mockHttpWitnessProvider = {
    attestAll: jest.fn().mockResolvedValue([
      {
        witnessId: 'http-wit-1',
        witnessType: 'HTTP_TRANSPARENCY',
        receiptHash: 'hash-http-1',
        signature: 'sig-http-1',
        publicKey: 'pub-http-1',
        algorithm: 'Ed25519',
      },
      {
        witnessId: 'http-wit-2',
        witnessType: 'REKOR_COSIGN',
        receiptHash: 'hash-http-2',
        signature: 'sig-http-2',
        publicKey: 'pub-http-2',
        algorithm: 'ECDSA_P256',
      },
    ]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WitnessService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: MockWitnessProvider, useValue: mockMockWitnessProvider },
        { provide: HttpWitnessProvider, useValue: mockHttpWitnessProvider },
      ],
    }).compile();

    service = module.get<WitnessService>(WitnessService);
    prisma = module.get<PrismaService>(PrismaService);
    mockWitnessProvider = module.get<MockWitnessProvider>(MockWitnessProvider);
    httpWitnessProvider = module.get<HttpWitnessProvider>(HttpWitnessProvider);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('collects receipts in non-production mode and returns TEST_ONLY state', async () => {
    process.env.NODE_ENV = 'test';

    const result = await service.collectReceipts('chk-001', 'merkle-root-abc');

    expect(mockMockWitnessProvider.attest).toHaveBeenCalledWith(
      'merkle-root-abc',
    );
    expect(mockPrismaService.witnessReceipt.create).toHaveBeenCalled();
    expect(result.witnessAssuranceState).toBe('TEST_ONLY');
    expect(result.receipts.length).toBe(1);
    expect(result.receipts[0].witness_type).toBe('MOCK');
  });

  it('collects receipts in production mode and returns WITNESS_FULL when >=2 independent witnesses attest', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const result = await service.collectReceipts(
        'chk-002',
        'merkle-root-xyz',
      );

      expect(mockHttpWitnessProvider.attestAll).toHaveBeenCalledWith(
        'merkle-root-xyz',
      );
      expect(mockPrismaService.witnessReceipt.create).toHaveBeenCalledTimes(2);
      expect(result.witnessAssuranceState).toBe('WITNESS_FULL');
      expect(result.receipts.length).toBe(2);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
