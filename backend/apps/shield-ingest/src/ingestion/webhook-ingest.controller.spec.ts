import { Test, TestingModule } from '@nestjs/testing';
import { WebhookIngestController } from './webhook-ingest.controller';
import { RawIngestService } from './raw-ingest.service';
import { CloudNormalizationBridgeService } from '../normalization/cloud-normalization-bridge.service';
import { HttpStatus } from '@nestjs/common';
import { WebhookSignatureGuard } from './guards/webhook-signature.guard';

describe('WebhookIngestController', () => {
  let controller: WebhookIngestController;
  let rawIngestMock: any;
  let normalizationBridgeMock: any;

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

  beforeEach(async () => {
    rawIngestMock = {
      processWebhookPayload: jest.fn().mockResolvedValue(mockIngestionResult),
    };

    normalizationBridgeMock = {
      normalizeCloudTrailRecord: jest.fn().mockResolvedValue({}),
      normalizeCrowdStrikeDetection: jest.fn().mockResolvedValue({}),
      normalizeOktaEvent: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookIngestController],
      providers: [
        { provide: RawIngestService, useValue: rawIngestMock },
        {
          provide: CloudNormalizationBridgeService,
          useValue: normalizationBridgeMock,
        },
      ],
    })
      .overrideGuard(WebhookSignatureGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WebhookIngestController>(WebhookIngestController);
  });

  it('should return 202 ACCEPTED for generic webhook', async () => {
    const response = await controller.handleWebhook(
      'conn-1',
      { 'x-tenant-id': 'tenant-1' },
      { eventId: 'evt-100', eventType: 'user.login' },
    );

    expect(response.statusCode).toBe(HttpStatus.ACCEPTED);
    expect(response.message).toContain('Webhook payload accepted');
    expect(response.data).toBe(mockIngestionResult);
    expect(rawIngestMock.processWebhookPayload).toHaveBeenCalledWith(
      'conn-1',
      { 'x-tenant-id': 'tenant-1' },
      { eventId: 'evt-100', eventType: 'user.login' },
    );
  });

  it('should accept AWS CloudTrail webhook and normalize records', async () => {
    const payload = {
      Records: [
        {
          eventSource: 'iam.amazonaws.com',
          eventName: 'CreateUser',
          eventTime: '2026-09-05T08:00:00Z',
        },
      ],
    };

    const response = await controller.handleCloudTrailWebhook(
      'conn-aws-01',
      { 'x-tenant-id': 'tenant-1' },
      payload,
    );

    expect(response.statusCode).toBe(HttpStatus.ACCEPTED);
    expect(response.message).toContain('AWS CloudTrail');
    expect(normalizationBridgeMock.normalizeCloudTrailRecord).toHaveBeenCalledWith(
      payload.Records[0],
      'tenant-1',
      'dev',
    );
  });

  it('should accept CrowdStrike Falcon webhook and normalize detection payload', async () => {
    const payload = {
      detection_id: 'cs-det-01',
      behaviors: [{ tactic: 'Execution', technique: 'PowerShell' }],
    };

    const response = await controller.handleCrowdStrikeWebhook(
      'conn-cs-01',
      { 'x-tenant-id': 'tenant-1' },
      payload,
    );

    expect(response.statusCode).toBe(HttpStatus.ACCEPTED);
    expect(response.message).toContain('CrowdStrike Falcon');
    expect(normalizationBridgeMock.normalizeCrowdStrikeDetection).toHaveBeenCalled();
  });

  it('should accept Okta event hook and normalize event', async () => {
    const payload = {
      actor: { id: 'usr-okta', alternateId: 'user@corp.internal' },
      outcome: { result: 'SUCCESS' },
      eventType: 'user.authentication.sso',
    };

    const response = await controller.handleOktaWebhook(
      'conn-okta-01',
      { 'x-tenant-id': 'tenant-1' },
      payload,
    );

    expect(response.statusCode).toBe(HttpStatus.ACCEPTED);
    expect(response.message).toContain('Okta event hook');
    expect(normalizationBridgeMock.normalizeOktaEvent).toHaveBeenCalled();
  });
});
