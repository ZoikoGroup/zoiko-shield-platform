import { Test, TestingModule } from '@nestjs/testing';
import { AirgapIngestController } from './airgap-ingest.controller';
import { OfflineTelemetryBufferService } from './offline-telemetry-buffer.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';

describe('AirgapIngestController', () => {
  let controller: AirgapIngestController;
  let service: OfflineTelemetryBufferService;

  beforeEach(async () => {
    const mockService = {
      syncTelemetryBatch: jest.fn().mockResolvedValue({
        receiptId: 'rcpt-batch-01',
        batchId: 'batch-01',
        syncedEventsCount: 5,
        verificationStatus: 'BATCH_VERIFIED_AND_INGESTED',
      }),
      getBatchStatus: jest.fn().mockReturnValue({
        receiptId: 'rcpt-batch-01',
        batchId: 'batch-01',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AirgapIngestController],
      providers: [
        {
          provide: OfflineTelemetryBufferService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AirgapIngestController>(AirgapIngestController);
    service = module.get<OfflineTelemetryBufferService>(
      OfflineTelemetryBufferService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should sync airgap batch', async () => {
    const res = await controller.syncBatch(
      '11111111-1111-1111-1111-111111111111',
      {
        batchId: 'batch-01',
        sourceNodeId: 'sensor-01',
        facilityLocation: 'Field-Site-1',
        totalEvents: 1,
        firstSequenceNumber: 1,
        lastSequenceNumber: 1,
        events: [
          {
            sequenceNumber: 1,
            eventId: 'e-1',
            sourceNodeId: 'sensor-01',
            facilityLocation: 'Field-Site-1',
            eventType: 'TEMP',
            payload: { c: 24 },
            capturedAt: new Date().toISOString(),
            nodeSignature: 'sig-1',
          },
        ],
        nodeAttestationSignature: 'sig-node',
      },
    );

    expect(res.statusCode).toBe(200);
    expect(res.data.syncedEventsCount).toBe(5);
  });
});
