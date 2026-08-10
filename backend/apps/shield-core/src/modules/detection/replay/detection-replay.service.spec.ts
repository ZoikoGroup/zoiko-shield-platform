import { Test, TestingModule } from '@nestjs/testing';
import { DetectionReplayService } from './detection-replay.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { DetectionRegistryService } from '../registry/detection-registry.service';

describe('DetectionReplayService', () => {
  let service: DetectionReplayService;
  let prismaMock: any;
  let registryMock: any;
  let ruleMock: any;

  const eventPayloadSnapshot = JSON.stringify({
    tenantId: 'tenant-a',
    environmentId: 'env-1',
    normalizedEventId: 'evt-1',
    eventClass: 'AUTHENTICATION',
    eventCategory: 'IDENTITY',
    eventActivity: 'signin',
    actorUserId: 'user-1',
    actorEmail: 'user@example.com',
    sourceIp: '203.0.113.5',
    action: 'SIGN_IN',
    outcome: 'FAILURE',
    occurredAt: new Date().toISOString(),
  });

  const evaluation = {
    id: 'eval-1',
    tenant_id: 'tenant-a',
    detection_version_id: 'v1',
    context_snapshot_id: 'snap-1',
    result: 'MATCH',
    event_payload_snapshot: eventPayloadSnapshot,
    detectionVersion: {
      id: 'v1',
      configuration: '{}',
      detectionDefinition: { key: 'SUSPICIOUS_LOGIN_NEW_LOCATION' },
    },
  };

  beforeEach(async () => {
    prismaMock = {
      detectionEvaluation: { findUnique: jest.fn().mockResolvedValue(evaluation) },
      contextSnapshot: {
        findUnique: jest.fn().mockResolvedValue({ id: 'snap-1', identity_entity_id: 'identity-1', asset_id: null, context_health: 'RESOLVED' }),
      },
      identityEntity: {
        findUnique: jest.fn().mockResolvedValue({ id: 'identity-1', status: 'ACTIVE', identity_type: 'MANAGED_IDENTITY' }),
      },
      asset: { findUnique: jest.fn().mockResolvedValue(null) },
      detectionReplay: { create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'replay-1', ...data })) },
    };
    ruleMock = { key: 'SUSPICIOUS_LOGIN_NEW_LOCATION', evaluate: jest.fn() };
    registryMock = { getRuleImplementation: jest.fn().mockReturnValue(ruleMock) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DetectionReplayService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: DetectionRegistryService, useValue: registryMock },
      ],
    }).compile();

    service = module.get<DetectionReplayService>(DetectionReplayService);
  });

  it('records divergence=false when replaying with identical frozen context produces the same result', async () => {
    ruleMock.evaluate.mockReturnValue({ result: 'MATCH', factors: [], incompleteData: false, reasons: [] });

    const replay = await service.replay('eval-1');

    expect(replay.divergence).toBe(false);
    expect(replay.original_result).toBe('MATCH');
    expect(replay.replay_result).toBe('MATCH');
    // Proves replay is driven by the frozen payload snapshot, not a live NormalizedEvent read.
    expect(prismaMock.identityEntity.findUnique).toHaveBeenCalledWith({ where: { id: 'identity-1' } });
  });

  it('records divergence=true (NON_DETERMINISTIC) when the replay result differs from the original', async () => {
    ruleMock.evaluate.mockReturnValue({ result: 'NO_MATCH', factors: [], incompleteData: false, reasons: [] });

    const replay = await service.replay('eval-1');

    expect(replay.divergence).toBe(true);
    expect(replay.reason).toContain('NON_DETERMINISTIC');
  });

  it('throws for an unknown evaluation id rather than replaying nothing', async () => {
    prismaMock.detectionEvaluation.findUnique.mockResolvedValue(null);

    await expect(service.replay('missing')).rejects.toThrow();
  });
});
