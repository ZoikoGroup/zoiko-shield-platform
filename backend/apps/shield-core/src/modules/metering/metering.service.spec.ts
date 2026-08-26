import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { MeteringService } from './metering.service';
import { MeterDefinitionService } from './meter-definition.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MeterGovernanceService } from './meter-governance.service';

describe('MeteringService (ZS-COM-BILL-001 Part 7: accepted != billable)', () => {
  let service: MeteringService;
  let prismaMock: any;
  let definitionMock: any;
  let governanceMock: any;

  const definition = {
    id: 'def-1',
    meter_key: 'endpoint.telemetry',
    version: 1,
    unit: 'EVENTS',
    source_scope: JSON.stringify(['crowdstrike']),
    billable_policy: 'STANDARD',
  };

  beforeEach(async () => {
    prismaMock = {
      meterEvent: { create: jest.fn(), findFirst: jest.fn() },
      usageRecord: { create: jest.fn() },
      $executeRaw: jest.fn(),
      $transaction: jest.fn((callback: any) => callback(prismaMock)),
    };
    definitionMock = { getActiveDefinition: jest.fn() };
    governanceMock = {
      immutableHash: jest.fn().mockReturnValue('immutable-hash'),
      resolveEffectivePolicy: jest.fn().mockResolvedValue(null),
      evaluate: jest.fn(),
      recordThresholds: jest.fn(),
      periodBounds: jest.fn().mockReturnValue({
        start: new Date('2026-08-01T00:00:00Z'),
        end: new Date('2026-09-01T00:00:00Z'),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeteringService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: MeterDefinitionService, useValue: definitionMock },
        { provide: MeterGovernanceService, useValue: governanceMock },
      ],
    }).compile();

    service = module.get<MeteringService>(MeteringService);
  });

  const baseDto = {
    tenantId: 't1',
    meterKey: 'endpoint.telemetry',
    source: 'crowdstrike',
    sourceEventId: 'evt-1',
    occurredAt: new Date(),
    quantity: 5,
    environmentId: 'prod',
    validationState: 'VALID' as const,
  };

  it('fails closed with no approved meter definition', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue(null);

    await expect(service.recordEvent(baseDto)).rejects.toThrow(
      ConflictException,
    );
  });

  it('an accepted event without contract authorization is retained but non-billable', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue(definition);
    prismaMock.meterEvent.findFirst.mockResolvedValue(null);
    prismaMock.meterEvent.create.mockResolvedValue({
      id: 'me-1',
      accepted_state: 'ACCEPTED',
      immutable_hash: 'immutable-hash',
      billable_state: 'NON_BILLABLE',
    });
    prismaMock.usageRecord.create.mockResolvedValue({
      id: 'ur-1',
      billable_quantity: 0,
    });

    const result = await service.recordEvent(baseDto);

    expect(result.event.accepted_state).toBe('ACCEPTED');
    expect(result.duplicate).toBe(false);
    expect(prismaMock.usageRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          billable_quantity: 0,
          accepted_quantity: 5,
        }),
      }),
    );
  });

  it('bills only the quantity returned by an approved contract-bound policy', async () => {
    const policy = { id: 'policy-1', contract_id: 'contract-1' };
    definitionMock.getActiveDefinition.mockResolvedValue(definition);
    prismaMock.meterEvent.findFirst.mockResolvedValue(null);
    governanceMock.resolveEffectivePolicy.mockResolvedValue(policy);
    governanceMock.evaluate.mockResolvedValue({
      policy,
      usageAuthorizationId: null,
      billableQuantity: 5,
      overageQuantity: 0,
      classification: 'CONTRACT_AUTHORIZED_BILLABLE',
      action: 'ACCEPT',
    });
    prismaMock.meterEvent.create.mockResolvedValue({
      id: 'me-authorized',
      immutable_hash: 'immutable-hash',
      accepted_state: 'ACCEPTED',
      billable_state: 'BILLABLE',
    });
    prismaMock.usageRecord.create.mockResolvedValue({
      id: 'ur-authorized',
      billable_quantity: 5,
    });

    await service.recordEvent(baseDto);

    expect(prismaMock.usageRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          meter_authorization_id: 'policy-1',
          contract_id: 'contract-1',
          billable_quantity: 5,
        }),
      }),
    );
    expect(governanceMock.recordThresholds).toHaveBeenCalledWith(
      policy,
      expect.any(Date),
    );
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
    expect(governanceMock.evaluate).toHaveBeenCalledWith(
      policy,
      5,
      expect.any(Date),
      undefined,
      prismaMock,
    );
  });

  it('a duplicate/replayed event does not increase billable quantity (no second UsageRecord)', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue(definition);
    prismaMock.meterEvent.findFirst.mockResolvedValue({
      id: 'me-1',
      accepted_state: 'ACCEPTED',
    });
    prismaMock.meterEvent.create.mockResolvedValue({
      id: 'me-2',
      accepted_state: 'DUPLICATE',
      billable_state: 'NON_BILLABLE',
    });

    const result = await service.recordEvent(baseDto);

    expect(result.duplicate).toBe(true);
    expect(result.usageRecord).toBeNull();
    expect(prismaMock.usageRecord.create).not.toHaveBeenCalled();
  });

  it('a rejected event never becomes billable and never touches UsageRecord', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue(definition);
    prismaMock.meterEvent.create.mockResolvedValue({
      id: 'me-3',
      accepted_state: 'REJECTED',
      billable_state: 'NON_BILLABLE',
    });

    const result = await service.recordEvent({
      ...baseDto,
      intake: 'REJECTED',
    });

    expect(result.event.accepted_state).toBe('REJECTED');
    expect(result.usageRecord).toBeNull();
    expect(prismaMock.usageRecord.create).not.toHaveBeenCalled();
  });

  it('quarantines a source outside the approved meter source scope', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue(definition);
    prismaMock.meterEvent.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'me-out-of-scope', ...data }),
    );

    const result = await service.recordEvent({
      ...baseDto,
      source: 'unknown-connector',
    });

    expect(result.event.accepted_state).toBe('QUARANTINED');
    expect(result.event.billable_state).toBe('NON_BILLABLE');
    expect(governanceMock.resolveEffectivePolicy).not.toHaveBeenCalled();
    expect(prismaMock.usageRecord.create).not.toHaveBeenCalled();
  });

  it('a quarantined event never becomes billable', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue(definition);
    prismaMock.meterEvent.create.mockResolvedValue({
      id: 'me-4',
      accepted_state: 'QUARANTINED',
      billable_state: 'NON_BILLABLE',
    });

    const result = await service.recordEvent({
      ...baseDto,
      intake: 'QUARANTINED',
    });

    expect(result.event.accepted_state).toBe('QUARANTINED');
    expect(prismaMock.usageRecord.create).not.toHaveBeenCalled();
  });

  it('provider processing loss is retained as non-billable evidence and never creates usage', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue(definition);
    prismaMock.meterEvent.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'me-loss', ...data }),
    );

    const result = await service.recordEvent({
      ...baseDto,
      intake: 'PROCESSING_LOSS',
    });

    expect(result.event.accepted_state).toBe('PROCESSING_LOSS');
    expect(result.event.billable_state).toBe('NON_BILLABLE');
    expect(result.usageRecord).toBeNull();
    expect(prismaMock.usageRecord.create).not.toHaveBeenCalled();
  });

  it('a platform-generated event is forced NON_BILLABLE even on a STANDARD meter', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue(definition);
    prismaMock.meterEvent.findFirst.mockResolvedValue(null);
    prismaMock.meterEvent.create.mockResolvedValue({
      id: 'me-5',
      accepted_state: 'ACCEPTED',
      billable_state: 'NON_BILLABLE',
    });
    prismaMock.usageRecord.create.mockResolvedValue({
      id: 'ur-2',
      billable_quantity: 0,
    });

    const result = await service.recordEvent({
      ...baseDto,
      isPlatformGenerated: true,
    });

    expect(result.usageRecord).toBeTruthy();
    expect(prismaMock.usageRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ billable_quantity: 0 }),
      }),
    );
  });

  it('a NEVER_BILLABLE meter policy forces every event on it to NON_BILLABLE', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue({
      ...definition,
      billable_policy: 'NEVER_BILLABLE',
    });
    prismaMock.meterEvent.findFirst.mockResolvedValue(null);
    prismaMock.meterEvent.create.mockResolvedValue({
      id: 'me-6',
      accepted_state: 'ACCEPTED',
      billable_state: 'NON_BILLABLE',
    });
    prismaMock.usageRecord.create.mockResolvedValue({
      id: 'ur-3',
      billable_quantity: 0,
    });

    await service.recordEvent(baseDto);

    expect(prismaMock.usageRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ billable_quantity: 0 }),
      }),
    );
  });
});
