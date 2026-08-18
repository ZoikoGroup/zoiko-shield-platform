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

  it('should promote alert to case', async () => {
    const mockPromoteResult = {
      alertId: 'alert-1',
      status: 'PROMOTED_TO_CASE',
    };
    serviceMock.promoteAlertToCase.mockResolvedValue(mockPromoteResult);

    const response = await controller.createCaseFromAlert(
      'tenant-1',
      'alert-1',
    );

    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.data).toBe(mockPromoteResult);
  });
});
