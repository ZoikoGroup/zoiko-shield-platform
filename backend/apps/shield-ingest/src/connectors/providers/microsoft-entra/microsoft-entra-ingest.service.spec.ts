import { Test, TestingModule } from '@nestjs/testing';
import { MicrosoftEntraIngestService } from './microsoft-entra-ingest.service';
import { EntraNormalizerService } from './entra.normalizer';
import { KafkaProducerService } from '../../../kafka/kafka.producer.service';
import { QuarantineService } from '../../../ingestion/quarantine.service';

describe('MicrosoftEntraIngestService (Spec §5 & §20)', () => {
  let service: MicrosoftEntraIngestService;

  const mockKafkaProducer = {
    publishEvent: jest.fn().mockResolvedValue(undefined),
  };

  const mockQuarantineService = {
    quarantine: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MicrosoftEntraIngestService,
        EntraNormalizerService,
        { provide: KafkaProducerService, useValue: mockKafkaProducer },
        { provide: QuarantineService, useValue: mockQuarantineService },
      ],
    }).compile();

    service = module.get<MicrosoftEntraIngestService>(MicrosoftEntraIngestService);
    jest.clearAllMocks();
  });

  it('should ingest, normalize, and publish valid Entra sign-in records', async () => {
    const records = [
      {
        id: 'entra-signin-001',
        createdDateTime: '2026-09-10T08:15:00Z',
        userPrincipalName: 'bob.security@acme.com',
        userId: 'usr-aad-bob-99',
        appDisplayName: 'Azure Portal',
        appId: 'app-c4a1-azure-portal',
        ipAddress: '198.51.100.25',
        clientAppUsed: 'Browser',
        status: {
          errorCode: 0,
        },
        riskLevelDuringSignIn: 'none',
        conditionalAccessStatus: 'success',
      },
    ];

    const result = await service.ingestEntraBatch(
      'tenant-acme-eu',
      'PRODUCTION-EU-WEST',
      records,
      'eu-west-1',
    );

    expect(result.totalRecords).toBe(1);
    expect(result.acceptedCount).toBe(1);
    expect(result.quarantinedCount).toBe(0);
    expect(result.normalizedEvents.length).toBe(1);
    expect(result.normalizedEvents[0].user_identity.username).toBe('bob.security@acme.com');
    expect(result.normalizedEvents[0].authentication_result).toBe('SUCCESS');
    expect(mockKafkaProducer.publishEvent).toHaveBeenCalledTimes(1);
  });

  it('should route invalid/malformed Entra records to DLQ quarantine', async () => {
    const malformedRecords = [
      {
        createdDateTime: '2026-09-10T08:15:00Z',
        // Missing mandatory id and userPrincipalName
      },
    ];

    const result = await service.ingestEntraBatch(
      'tenant-acme-eu',
      'PRODUCTION-EU-WEST',
      malformedRecords,
    );

    expect(result.totalRecords).toBe(1);
    expect(result.acceptedCount).toBe(0);
    expect(result.quarantinedCount).toBe(1);
    expect(mockQuarantineService.quarantine).toHaveBeenCalledTimes(1);
  });
});
