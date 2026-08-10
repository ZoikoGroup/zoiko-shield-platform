import { Test, TestingModule } from '@nestjs/testing';
import { DetectionEngineController } from './detection-engine.controller';
import { DetectionEngineService } from './detection-engine.service';
import { HttpStatus } from '@nestjs/common';

describe('DetectionEngineController', () => {
  let controller: DetectionEngineController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      createRule: jest.fn(),
      getRules: jest.fn(),
      getRuleById: jest.fn(),
      updateRule: jest.fn(),
      activateRule: jest.fn(),
      disableRule: jest.fn(),
      testRule: jest.fn(),
      replayDetections: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DetectionEngineController],
      providers: [{ provide: DetectionEngineService, useValue: serviceMock }],
    }).compile();

    controller = module.get<DetectionEngineController>(DetectionEngineController);
  });

  it('should return created rule on POST /api/v1/detections', async () => {
    const mockRule = { id: 'rule-1', name: 'Failed Login Rule' };
    serviceMock.createRule.mockResolvedValue(mockRule);

    const response = await controller.createRule('tenant-1', {
      name: 'Failed Login Rule',
      conditionDefinition: {
        ruleType: 'MATCH',
        conditions: [{ field: 'outcome', operator: 'EQUALS', value: 'FAILED' }],
      },
    });

    expect(response.statusCode).toBe(HttpStatus.CREATED);
    expect(response.data).toBe(mockRule);
  });

  it('should test rule matching', async () => {
    const testResult = { match: true, reason: 'Matched' };
    serviceMock.testRule.mockResolvedValue(testResult);

    const response = await controller.testRule('rule-1', {
      sampleEvent: { outcome: 'FAILED' },
    });

    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.data).toBe(testResult);
  });
});
