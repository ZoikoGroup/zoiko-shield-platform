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
