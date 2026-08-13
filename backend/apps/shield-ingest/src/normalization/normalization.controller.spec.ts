import { Test, TestingModule } from '@nestjs/testing';
import { NormalizationController } from './normalization.controller';
import { NormalizationService } from './normalization.service';
import { HttpStatus } from '@nestjs/common';

describe('NormalizationController', () => {
  let controller: NormalizationController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      getNormalizedEvents: jest.fn(),
      getNormalizedEventById: jest.fn(),
      getQuarantinedEvents: jest.fn(),
      reprocessQuarantinedEvent: jest.fn(),
      replayEvents: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NormalizationController],
      providers: [{ provide: NormalizationService, useValue: serviceMock }],
    }).compile();

    controller = module.get<NormalizationController>(NormalizationController);
  });

  it('should return normalized events for tenant', async () => {
    const mockEvents = [{ id: 'norm-1', event_class: 'AUTHENTICATION' }];
    serviceMock.getNormalizedEvents.mockResolvedValue(mockEvents);

    const response = await controller.getNormalizedEvents(
      'tenant-1',
      undefined,
      10,
    );

    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.data).toBe(mockEvents);
    expect(serviceMock.getNormalizedEvents).toHaveBeenCalledWith(
      'tenant-1',
      10,
    );
  });

  it('should reprocess quarantined event', async () => {
    const mockResult = {
      quarantineId: 'q-1',
      rawEventId: 'r-1',
      status: 'REPROCESSED',
    };
    serviceMock.reprocessQuarantinedEvent.mockResolvedValue(mockResult);

    const response = await controller.reprocessQuarantinedEvent(
      'tenant-1',
      'q-1',
    );

    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.data).toBe(mockResult);
    expect(serviceMock.reprocessQuarantinedEvent).toHaveBeenCalledWith(
      'tenant-1',
      'q-1',
    );
  });
});
