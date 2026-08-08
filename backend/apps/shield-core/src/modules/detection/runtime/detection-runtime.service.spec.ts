import { Test, TestingModule } from '@nestjs/testing';
import { DetectionRuntimeService } from './detection-runtime.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { DetectionRegistryService } from '../registry/detection-registry.service';
import { KafkaProducerService } from '../../../kafka/kafka-producer.service';
import { AlertCreationService } from '../../alert/services/alert-creation.service';
import { NormalizedEventContract, ResolvedContext } from '../../security-context/context/context.types';

describe('DetectionRuntimeService', () => {
  let service: DetectionRuntimeService;
  let prismaMock: any;
  let registryMock: any;
  let kafkaMock: any;
  let alertCreationMock: any;
  let ruleMock: any;

  const payload: NormalizedEventContract = {
    tenantId: 'tenant-a',
    environmentId: 'env-1',
    region: 'us',
    normalizedEventId: 'evt-1',
    connectorId: 'conn-1',
    sourceSystem: 'microsoft-entra',
    eventClass: 'AUTHENTICATION',
    actorUserId: 'user-1',
    actorEmail: 'user@example.com',
    sourceIp: '203.0.113.5',
    outcome: 'FAILURE',
    occurredAt: new Date().toISOString(),
    schemaVersion: 'v1.0',
    normalizerVersion: '1.0',
    correlationId: 'corr-1',
    traceId: 'trace-1',
    sourceHealthState: 'HEALTHY',
  };

  const resolved: ResolvedContext = {
    eventId: 'evt-1',
    identityEntityId: 'identity-1',
    assetId: undefined,
    contextSnapshotId: 'snap-1',
    contextHealth: 'RESOLVED',
  };

  beforeEach(async () => {
    prismaMock = {
      identityEntity: { findUnique: jest.fn().mockResolvedValue({ id: 'identity-1', status: 'ACTIVE', identity_type: 'MANAGED_IDENTITY' }) },
      asset: { findUnique: jest.fn().mockResolvedValue(null) },
      detectionEvaluation: { create: jest.fn().mockResolvedValue({ id: 'eval-1' }) },
      detectionMatch: { upsert: jest.fn().mockResolvedValue({ id: 'match-1' }) },
    };
    ruleMock = { key: 'SUSPICIOUS_LOGIN_NEW_LOCATION', evaluate: jest.fn() };
    registryMock = {
      findApplicable: jest.fn().mockResolvedValue([
        {
          id: 'v1',
          detection_definition_id: 'def-1',
          severity: 'HIGH',
          configuration: '{}',
          detectionDefinition: { key: 'SUSPICIOUS_LOGIN_NEW_LOCATION', name: 'Suspicious Login' },
        },
      ]),
      getRuleImplementation: jest.fn().mockReturnValue(ruleMock),
    };
    kafkaMock = { publishEvent: jest.fn().mockResolvedValue(undefined) };
    alertCreationMock = { createFromMatch: jest.fn().mockResolvedValue({ alertId: 'alert-1', suppressed: false }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DetectionRuntimeService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: DetectionRegistryService, useValue: registryMock },
        { provide: KafkaProducerService, useValue: kafkaMock },
        { provide: AlertCreationService, useValue: alertCreationMock },
      ],
    }).compile();

    service = module.get<DetectionRuntimeService>(DetectionRuntimeService);
  });

  it('resolves identity/asset by id from the resolved context, never reading NormalizedEvent', async () => {
    ruleMock.evaluate.mockReturnValue({ result: 'MATCH', factors: [], confidence: 0.9, incompleteData: false, reasons: [] });

    await service.evaluateFromEvent(payload, resolved);

    expect(prismaMock.identityEntity.findUnique).toHaveBeenCalledWith({ where: { id: 'identity-1' } });
    expect(prismaMock.asset.findUnique).not.toHaveBeenCalled();
  });

  it('stores the event payload snapshot on the DetectionEvaluation for later replay', async () => {
    ruleMock.evaluate.mockReturnValue({ result: 'NO_MATCH', factors: [], incompleteData: false, reasons: [] });

    await service.evaluateFromEvent(payload, resolved);

    expect(prismaMock.detectionEvaluation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event_payload_snapshot: JSON.stringify(payload) }) }),
    );
  });

  it('on MATCH: creates a DetectionMatch, publishes detection.matched.v1, and calls AlertCreationService in-process', async () => {
    ruleMock.evaluate.mockReturnValue({ result: 'MATCH', factors: [], confidence: 0.9, incompleteData: false, reasons: [] });

    await service.evaluateFromEvent(payload, resolved);

    expect(prismaMock.detectionMatch.upsert).toHaveBeenCalledTimes(1);
    expect(kafkaMock.publishEvent).toHaveBeenCalledWith(
      'detection.matched.v1',
      'detection.matched',
      expect.objectContaining({ tenantId: 'tenant-a', primaryEventId: 'evt-1' }),
      expect.any(Object),
    );
    expect(alertCreationMock.createFromMatch).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a', detectionMatchId: 'match-1', identityEntityId: 'identity-1' }),
    );
  });

  it('does not create a match or call AlertCreationService on NO_MATCH', async () => {
    ruleMock.evaluate.mockReturnValue({ result: 'NO_MATCH', factors: [], incompleteData: false, reasons: [] });

    await service.evaluateFromEvent(payload, resolved);

    expect(prismaMock.detectionMatch.upsert).not.toHaveBeenCalled();
    expect(alertCreationMock.createFromMatch).not.toHaveBeenCalled();
  });
});
