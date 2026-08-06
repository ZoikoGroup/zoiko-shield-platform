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
  });
});
