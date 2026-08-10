import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { HttpStatus } from '@nestjs/common';

describe('DashboardController', () => {
  let controller: DashboardController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      getOverview: jest.fn(),
      getConnectorMetrics: jest.fn(),
      getEventMetrics: jest.fn(),
      getAlertMetrics: jest.fn(),
      getCaseMetrics: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: serviceMock }],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
  });

  it('should return tenant overview metrics', async () => {
    const mockOverview = { connectors: { total: 2 } };
    serviceMock.getOverview.mockResolvedValue(mockOverview);

    const response = await controller.getOverview('tenant-1');
    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.data).toBe(mockOverview);
  });
});
