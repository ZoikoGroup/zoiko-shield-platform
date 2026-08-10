import { Test, TestingModule } from '@nestjs/testing';
import { SLAClaimController } from './sla-claim.controller';
import { SLAClaimService } from './sla-claim.service';
import { HttpStatus } from '@nestjs/common';

describe('SLAClaimController', () => {
  let controller: SLAClaimController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      evaluateClaimEligibility: jest.fn(),
      getClaimEvaluations: jest.fn(),
      getSLAPerformanceMetrics: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SLAClaimController],
      providers: [{ provide: SLAClaimService, useValue: serviceMock }],
    }).compile();

    controller = module.get<SLAClaimController>(SLAClaimController);
  });

  it('should evaluate claim eligibility and return OK status', async () => {
    const mockEvaluation = { id: 'eval-1', status: 'QUALIFIED' };
    serviceMock.evaluateClaimEligibility.mockResolvedValue(mockEvaluation);

    const response = await controller.evaluateClaimEligibility('tenant-1', {
      claimKey: 'CLAIM_15MIN_RESPONSE',
    });

    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.data).toBe(mockEvaluation);
  });

  it('should return SLA performance metrics with OK status', async () => {
    const mockMetrics = { slaCompliancePercentage: 100.0 };
    serviceMock.getSLAPerformanceMetrics.mockResolvedValue(mockMetrics);

    const response = await controller.getSLAPerformanceMetrics('tenant-1');
    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.data).toBe(mockMetrics);
  });
});
