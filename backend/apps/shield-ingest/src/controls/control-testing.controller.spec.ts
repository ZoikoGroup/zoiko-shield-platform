import { Test, TestingModule } from '@nestjs/testing';
import { ControlTestingController } from './control-testing.controller';
import { ControlTestingService } from './control-testing.service';
import { HttpStatus } from '@nestjs/common';

describe('ControlTestingController', () => {
  let controller: ControlTestingController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      createControlObjective: jest.fn(),
      getControlObjectives: jest.fn(),
      evaluateControlObjective: jest.fn(),
      getControlResults: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ControlTestingController],
      providers: [{ provide: ControlTestingService, useValue: serviceMock }],
    }).compile();

    controller = module.get<ControlTestingController>(ControlTestingController);
  });

  it('should list control objectives and return OK status', async () => {
    const mockObjectives = [{ id: 'ctrl-1', code: 'MFA_ENFORCED' }];
    serviceMock.getControlObjectives.mockResolvedValue(mockObjectives);

    const response = await controller.getControlObjectives('tenant-1');
    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.data).toBe(mockObjectives);
  });

  it('should evaluate control objective and return OK status', async () => {
    const mockRun = { id: 'run-1', result: 'PASS' };
    serviceMock.evaluateControlObjective.mockResolvedValue(mockRun);

    const response = await controller.evaluateControlObjective('ctrl-1');
    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.data).toBe(mockRun);
  });
});
