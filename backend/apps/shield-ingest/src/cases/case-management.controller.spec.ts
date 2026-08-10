import { Test, TestingModule } from '@nestjs/testing';
import { CaseManagementController } from './case-management.controller';
import { CaseManagementService } from './case-management.service';
import { HttpStatus } from '@nestjs/common';

describe('CaseManagementController', () => {
  let controller: CaseManagementController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      createCase: jest.fn(),
      getCases: jest.fn(),
      getCaseById: jest.fn(),
      updateCase: jest.fn(),
      assignCase: jest.fn(),
      transitionState: jest.fn(),
      addNote: jest.fn(),
      linkEvidence: jest.fn(),
      getCaseTimeline: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CaseManagementController],
      providers: [{ provide: CaseManagementService, useValue: serviceMock }],
    }).compile();

    controller = module.get<CaseManagementController>(CaseManagementController);
  });

  it('should return created case', async () => {
    const mockCase = { id: 'case-1', title: 'Test Case', status: 'NEW' };
    serviceMock.createCase.mockResolvedValue(mockCase);

    const response = await controller.createCase('tenant-1', {
      title: 'Test Case',
    });

    expect(response.statusCode).toBe(HttpStatus.CREATED);
    expect(response.data).toBe(mockCase);
  });

  it('should return cases for tenant', async () => {
    const mockCases = [{ id: 'case-1', title: 'Test Case' }];
    serviceMock.getCases.mockResolvedValue(mockCases);

    const response = await controller.getCases('tenant-1', undefined, undefined, undefined, undefined);

    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.data).toBe(mockCases);
  });

  it('should transition case status', async () => {
    const mockUpdated = { id: 'case-1', status: 'TRIAGED' };
    serviceMock.transitionState.mockResolvedValue(mockUpdated);

    const response = await controller.transitionState('case-1', {
      targetStatus: 'TRIAGED',
    });

    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.data).toBe(mockUpdated);
  });
});
