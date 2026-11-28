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

describe('ShieldCoreController: Kafka consumer visibility', () => {
  const build = (status: any) =>
    new ShieldCoreController(new ShieldCoreService(), undefined, status === undefined ? undefined : ({ getStatus: () => status } as any));
  const up = { topics: ['event.normalized.v1'], running: true, lastError: null, lastStartedAt: '2026-11-28T12:00:00Z', attempts: 1 };
  const down = { ...up, running: false, lastError: 'ENOTFOUND redpanda', attempts: 7 };

  it('reports a running consumer on /health/consumer', () => {
    const r: any = build(up).getHealthConsumer();
    expect(r.status).toBe('running');
    expect(r.kafkaConsumer.healthy).toBe(true);
  });

  it('answers 503 with the reason when the consumer is down', () => {
    try {
      build(down).getHealthConsumer();
      throw new Error('expected 503');
    } catch (e: any) {
      expect(e.getStatus()).toBe(503);
      expect(e.getResponse().kafkaConsumer).toMatchObject({ healthy: false, lastError: 'ENOTFOUND redpanda', attempts: 7 });
    }
  });

  it('is healthy when there is nothing to consume, and when no consumer is wired', () => {
    expect((build({ ...down, topics: [] }).getHealthConsumer() as any).status).toBe('running');
    expect((build(undefined).getHealthConsumer() as any).status).toBe('running');
  });

  it('shows the consumer in readiness without making readiness fail', async () => {
    const r: any = await build(down).getHealthReady();
    expect(r.status).toBe('ready'); // the API is still fine to serve
    expect(r.kafkaConsumer).toMatchObject({ healthy: false, running: false });
  });
});
