import { Test, TestingModule } from '@nestjs/testing';
import { AlertThrottlerService } from './alert-throttler.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AlertThrottlerService', () => {
  let service: AlertThrottlerService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      alert: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertThrottlerService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AlertThrottlerService>(AlertThrottlerService);
  });

  it('should return throttled=true if recent alert exists within window', async () => {
    prismaMock.alert.findFirst.mockResolvedValue({ id: 'alert-existing' });

    const result = await service.shouldThrottleAlert(
      'tenant-1',
      'rule-1',
      'host-100',
    );

    expect(result.throttled).toBe(true);
    expect(result.existingAlertId).toBe('alert-existing');
  });

  it('should return throttled=false if no recent alert exists', async () => {
    prismaMock.alert.findFirst.mockResolvedValue(null);

    const result = await service.shouldThrottleAlert(
      'tenant-1',
      'rule-1',
      'host-100',
    );

    expect(result.throttled).toBe(false);
  });
});
