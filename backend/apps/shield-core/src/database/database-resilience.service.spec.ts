import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseResilienceService } from './database-resilience.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DatabaseResilienceService', () => {
  let service: DatabaseResilienceService;
  let prisma: PrismaService;

  const mockPrismaService = {
    $queryRawUnsafe: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseResilienceService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<DatabaseResilienceService>(DatabaseResilienceService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns HEALTHY status on fast successful query check', async () => {
    mockPrismaService.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);

    const health = await service.checkHealth();
    expect(health.status).toBe('HEALTHY');
    expect(health.circuitBreakerState).toBe('CLOSED');
    expect(health.consecutiveFailures).toBe(0);
  });

  it('executes operation successfully through executeWithRetry', async () => {
    const op = jest.fn().mockResolvedValue('success-data');
    const result = await service.executeWithRetry(op);

    expect(result).toBe('success-data');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('retries on transient failure and recovers', async () => {
    const op = jest
      .fn()
      .mockRejectedValueOnce(new Error('Transient connection drop'))
      .mockResolvedValueOnce('recovered-data');

    const result = await service.executeWithRetry(op, { initialDelayMs: 10, maxRetries: 2 });
    expect(result).toBe('recovered-data');
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('trips circuit breaker to OPEN after exceeding failure threshold', async () => {
    mockPrismaService.$queryRawUnsafe.mockRejectedValue(new Error('Fatal DB failure'));

    for (let i = 0; i < 5; i++) {
      await service.checkHealth();
    }

    expect(service.getCircuitState()).toBe('OPEN');

    // Subsequent operation should reject immediately
    const op = jest.fn();
    await expect(service.executeWithRetry(op)).rejects.toThrow('Database circuit breaker is OPEN');
    expect(op).not.toHaveBeenCalled();
  });
});
