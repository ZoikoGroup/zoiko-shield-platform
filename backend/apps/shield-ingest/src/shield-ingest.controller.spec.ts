import { Test, TestingModule } from '@nestjs/testing';
import { ShieldIngestController } from './shield-ingest.controller';
import { ShieldIngestService } from './shield-ingest.service';

describe('ShieldIngestController', () => {
  let shieldIngestController: ShieldIngestController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [ShieldIngestController],
      providers: [ShieldIngestService],
    }).compile();

    shieldIngestController = app.get<ShieldIngestController>(
      ShieldIngestController,
    );
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(shieldIngestController.getHello()).toBe('Hello World!');
    });
  });
});

describe('ShieldIngestController: consumer visibility', () => {
  const build = (status: any) =>
    new ShieldIngestController({} as any, status === undefined ? undefined : ({ getStatus: () => status } as any));
  const up = { topics: ['telemetry.ingested'], running: true, lastError: null, lastStartedAt: 'x', attempts: 1 };

  it('is running when the normalizer is consuming', () => {
    expect((build(up).getHealthConsumer() as any).status).toBe('running');
  });

  it('answers 503 with the reason when the normalizer is down', () => {
    try {
      build({ ...up, running: false, lastError: 'ENOTFOUND redpanda', attempts: 5 }).getHealthConsumer();
      throw new Error('expected 503');
    } catch (e: any) {
      expect(e.getStatus()).toBe(503);
      expect(e.getResponse().kafkaConsumer).toMatchObject({ healthy: false, lastError: 'ENOTFOUND redpanda' });
    }
  });

  it('is fine when no consumer is wired', () => {
    expect((build(undefined).getHealthConsumer() as any).kafkaConsumer).toBeNull();
  });
});
