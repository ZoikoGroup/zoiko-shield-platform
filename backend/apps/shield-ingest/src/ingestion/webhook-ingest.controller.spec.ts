import { Test, TestingModule } from '@nestjs/testing';
import { WebhookIngestController } from './webhook-ingest.controller';
import { RawIngestService } from './raw-ingest.service';
import { HttpStatus } from '@nestjs/common';

describe('WebhookIngestController', () => {
  let controller: WebhookIngestController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      processWebhookPayload: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookIngestController],
      providers: [{ provide: RawIngestService, useValue: serviceMock }],
    }).compile();

    controller = module.get<WebhookIngestController>(WebhookIngestController);
  });

  it('should return 202 ACCEPTED with ingestion result', async () => {
    const mockIngestionResult = {
      id: 'raw-123',
      tenantId: 'tenant-1',
      environmentId: 'dev',
      connectorId: 'conn-1',
      sourceEventId: 'evt-100',
      payloadHash: 'hash-abc',
      processingStatus: 'ACCEPTED' as const,
      receivedAt: new Date(),
    };

    serviceMock.processWebhookPayload.mockResolvedValue(mockIngestionResult);

    const response = await controller.handleWebhook(
      'conn-1',
      { 'x-tenant-id': 'tenant-1' },
      { eventId: 'evt-100', eventType: 'user.login' },
    );

    expect(response.statusCode).toBe(HttpStatus.ACCEPTED);
    expect(response.message).toContain('Webhook payload accepted');
    expect(response.data).toBe(mockIngestionResult);
    expect(serviceMock.processWebhookPayload).toHaveBeenCalledWith(
      'conn-1',
      { 'x-tenant-id': 'tenant-1' },
      { eventId: 'evt-100', eventType: 'user.login' },
    );
  });
});
