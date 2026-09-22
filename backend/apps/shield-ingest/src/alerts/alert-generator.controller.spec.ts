import { Test, TestingModule } from '@nestjs/testing';
import { AlertGeneratorController } from './alert-generator.controller';
import { AlertGeneratorService } from './alert-generator.service';
import { HttpStatus } from '@nestjs/common';

describe('AlertGeneratorController', () => {
  let controller: AlertGeneratorController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      getAlerts: jest.fn(),
      getAlertById: jest.fn(),
      updateAlertStatus: jest.fn(),
      assignAlert: jest.fn(),
      promoteAlertToCase: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertGeneratorController],
      providers: [{ provide: AlertGeneratorService, useValue: serviceMock }],
    }).compile();

    controller = module.get<AlertGeneratorController>(AlertGeneratorController);
  });

  it('should return alerts for tenant', async () => {
    const mockAlerts = [{ id: 'alert-1', title: 'Alert 1' }];
    serviceMock.getAlerts.mockResolvedValue(mockAlerts);

    const response = await controller.getAlerts(
      'tenant-1',
      undefined,
      undefined,
      undefined,
      10,
    );

    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.data).toBe(mockAlerts);
  });

  it('returns the case that promotion actually created', async () => {
    const mockPromoteResult = {
      alertId: 'alert-1',
      status: 'ESCALATED_TO_CASE',
      caseId: 'case-1',
      caseTitle: 'Case: Suspicious login',
      caseStatus: 'NEW',
    };
    serviceMock.promoteAlertToCase.mockResolvedValue(mockPromoteResult);

    const response = await controller.createCaseFromAlert(
      'tenant-1',
      'alert-1',
    );

    expect(response.statusCode).toBe(HttpStatus.CREATED);
    expect(response.data).toBe(mockPromoteResult);
    // The whole point of the endpoint: a caller can follow the response to a
    // case that exists, instead of a "candidate payload" for one that doesn't.
    expect(response.data.caseId).toBe('case-1');
  });
});
