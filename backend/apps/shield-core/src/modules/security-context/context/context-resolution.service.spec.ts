import { Test, TestingModule } from '@nestjs/testing';
import { ContextResolutionService } from './context-resolution.service';
import { IdentityResolutionService } from '../identities/identity-resolution.service';
import { AssetResolutionService } from '../assets/asset-resolution.service';
import { RelationshipService } from '../relationship/relationship.service';
import { ContextSnapshotService } from './context-snapshot.service';
import { NormalizedEventContract } from './context.types';

describe('ContextResolutionService', () => {
  let service: ContextResolutionService;
  let identityMock: any;
  let assetMock: any;
  let relationshipMock: any;
  let snapshotMock: any;

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

  beforeEach(async () => {
    identityMock = {
      resolve: jest.fn().mockResolvedValue({
        identityEntityId: 'identity-1',
        decision: 'MATCHED',
      }),
    };
    assetMock = {
      resolve: jest
        .fn()
        .mockResolvedValue({ assetId: 'asset-1', decision: 'MATCHED' }),
    };
    relationshipMock = { upsert: jest.fn().mockResolvedValue({}) };
    snapshotMock = {
      build: jest
        .fn()
        .mockResolvedValue({ snapshotId: 'snap-1', contextHealth: 'RESOLVED' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextResolutionService,
        { provide: IdentityResolutionService, useValue: identityMock },
        { provide: AssetResolutionService, useValue: assetMock },
        { provide: RelationshipService, useValue: relationshipMock },
        { provide: ContextSnapshotService, useValue: snapshotMock },
      ],
    }).compile();

    service = module.get<ContextResolutionService>(ContextResolutionService);
  });

  it('resolves identity and asset entirely from the payload, never touching NormalizedEvent', async () => {
    const result = await service.resolveFromEvent(payload);

    expect(result).toEqual({
      eventId: 'evt-1',
      identityEntityId: 'identity-1',
      assetId: 'asset-1',
      contextSnapshotId: 'snap-1',
      contextHealth: 'RESOLVED',
    });
    expect(identityMock.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        sourceSystem: 'microsoft-entra',
        externalId: 'user-1',
      }),
    );
    expect(assetMock.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        sourceSystem: 'microsoft-entra',
        externalId: '203.0.113.5',
      }),
    );
  });

  it('creates a SIGNED_IN_TO relationship when both identity and asset resolve', async () => {
    await service.resolveFromEvent(payload);

    expect(relationshipMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 'identity-1',
        relation: 'SIGNED_IN_TO',
        objectId: 'asset-1',
      }),
    );
  });

  it('does not create a relationship when only identity resolves (no asset)', async () => {
    assetMock.resolve.mockResolvedValue(undefined);
    const payloadNoAsset = {
      ...payload,
      sourceIp: undefined,
      resourceId: undefined,
    };

    await service.resolveFromEvent(payloadNoAsset);

    expect(relationshipMock.upsert).not.toHaveBeenCalled();
  });

  it('passes sourceHealthState from the payload into the snapshot builder, never querying ConnectorHealthStatus itself', async () => {
    await service.resolveFromEvent(payload);

    expect(snapshotMock.build).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceHealthState: 'HEALTHY',
        eventId: 'evt-1',
      }),
    );
  });
});
