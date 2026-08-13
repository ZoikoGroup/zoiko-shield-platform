import { Test, TestingModule } from '@nestjs/testing';
import { HumanDecisionController } from './human-decision.controller';
import { HumanDecisionService } from './human-decision.service';
import { HttpStatus } from '@nestjs/common';

describe('HumanDecisionController', () => {
  let controller: HumanDecisionController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      recordDecision: jest.fn(),
      getDecisionsByCase: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HumanDecisionController],
      providers: [{ provide: HumanDecisionService, useValue: serviceMock }],
    }).compile();

    controller = module.get<HumanDecisionController>(HumanDecisionController);
  });

  it('should record human decision and return CREATED response', async () => {
    const mockDecision = { id: 'dec-1', decision_type: 'INCIDENT_DECLARATION' };
    serviceMock.recordDecision.mockResolvedValue(mockDecision);

    const response = await controller.recordDecision('tenant-1', 'case-1', {
      decisionType: 'INCIDENT_DECLARATION',
      decision: 'Declare P1 Security Incident',
    });

    expect(response.statusCode).toBe(HttpStatus.CREATED);
    expect(response.data).toBe(mockDecision);
    expect(serviceMock.recordDecision).toHaveBeenCalledWith(
      'tenant-1',
      'case-1',
      expect.objectContaining({ decision: 'Declare P1 Security Incident' }),
    );
  });
});
