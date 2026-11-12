import { Test, TestingModule } from '@nestjs/testing';
import { ShieldCoreController } from './shield-core.controller';
import { ShieldCoreService } from './shield-core.service';

describe('ShieldCoreController', () => {
  let shieldCoreController: ShieldCoreController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [ShieldCoreController],
      providers: [ShieldCoreService],
    }).compile();

    shieldCoreController = app.get<ShieldCoreController>(ShieldCoreController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(shieldCoreController.getHello()).toBe('Hello World!');
    });

    it('should return healthy status for getHealth()', () => {
      const res = shieldCoreController.getHealth();
      expect(res.status).toBe('healthy');
      expect(res.service).toBe('shield-core');
    });

    it('should return ready status for getHealthReady()', async () => {
      const res = await shieldCoreController.getHealthReady();
      expect(res.status).toBe('ready');
      expect(res.database).toBeDefined();
    });

    it('should throw 503 ServiceUnavailableException when database is UNHEALTHY', async () => {
      const controllerWithUnhealthyDb = new ShieldCoreController(
        new ShieldCoreService(),
        {
          checkHealth: jest.fn().mockResolvedValue({
            status: 'UNHEALTHY',
            circuitBreakerState: 'OPEN',
            latencyMs: 500,
            consecutiveFailures: 5,
            lastCheckedAt: new Date(),
          }),
        } as any,
      );

      await expect(controllerWithUnhealthyDb.getHealthReady()).rejects.toThrow(
        'Service Unavailable Exception',
      );
    });

    it('should return live status for getHealthLive()', () => {
      const res = shieldCoreController.getHealthLive();
      expect(res.status).toBe('live');
    });
  });
});
