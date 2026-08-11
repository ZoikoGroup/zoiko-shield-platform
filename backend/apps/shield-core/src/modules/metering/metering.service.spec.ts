import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { MeteringService } from './metering.service';
import { MeterDefinitionService } from './meter-definition.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('MeteringService (ZS-COM-BILL-001 Part 7: accepted != billable)', () => {
  let service: MeteringService;
  let prismaMock: any;
  let definitionMock: any;

  const definition = { id: 'def-1', unit: 'EVENTS', billable_policy: 'STANDARD' };

  beforeEach(async () => {
    prismaMock = {
      meterEvent: { create: jest.fn(), findFirst: jest.fn() },
      usageRecord: { create: jest.fn() },
    };
    definitionMock = { getActiveDefinition: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeteringService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: MeterDefinitionService, useValue: definitionMock },
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
  };

  it('fails closed with no approved meter definition', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue(null);

    await expect(service.recordEvent(baseDto)).rejects.toThrow(ConflictException);
  });

  it('a first-seen normal event is ACCEPTED/BILLABLE and creates a UsageRecord with matching billable_quantity', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue(definition);
    prismaMock.meterEvent.findFirst.mockResolvedValue(null);
    prismaMock.meterEvent.create.mockResolvedValue({ id: 'me-1', accepted_state: 'ACCEPTED', billable_state: 'BILLABLE' });
    prismaMock.usageRecord.create.mockResolvedValue({ id: 'ur-1', billable_quantity: 5 });

    const result = await service.recordEvent(baseDto);

    expect(result.event.accepted_state).toBe('ACCEPTED');
    expect(result.duplicate).toBe(false);
    expect(prismaMock.usageRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ billable_quantity: 5, accepted_quantity: 5 }) }),
    );
  });

  it('a duplicate/replayed event does not increase billable quantity (no second UsageRecord)', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue(definition);
    prismaMock.meterEvent.findFirst.mockResolvedValue({ id: 'me-1', accepted_state: 'ACCEPTED' });
    prismaMock.meterEvent.create.mockResolvedValue({ id: 'me-2', accepted_state: 'DUPLICATE', billable_state: 'NON_BILLABLE' });

    const result = await service.recordEvent(baseDto);

    expect(result.duplicate).toBe(true);
    expect(result.usageRecord).toBeNull();
    expect(prismaMock.usageRecord.create).not.toHaveBeenCalled();
  });

  it('a rejected event never becomes billable and never touches UsageRecord', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue(definition);
    prismaMock.meterEvent.create.mockResolvedValue({ id: 'me-3', accepted_state: 'REJECTED', billable_state: 'NON_BILLABLE' });

    const result = await service.recordEvent({ ...baseDto, intake: 'REJECTED' });

    expect(result.event.accepted_state).toBe('REJECTED');
    expect(result.usageRecord).toBeNull();
    expect(prismaMock.usageRecord.create).not.toHaveBeenCalled();
  });

  it('a quarantined event never becomes billable', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue(definition);
    prismaMock.meterEvent.create.mockResolvedValue({ id: 'me-4', accepted_state: 'QUARANTINED', billable_state: 'NON_BILLABLE' });

    const result = await service.recordEvent({ ...baseDto, intake: 'QUARANTINED' });

    expect(result.event.accepted_state).toBe('QUARANTINED');
    expect(prismaMock.usageRecord.create).not.toHaveBeenCalled();
  });

  it('a platform-generated event is forced NON_BILLABLE even on a STANDARD meter', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue(definition);
    prismaMock.meterEvent.findFirst.mockResolvedValue(null);
    prismaMock.meterEvent.create.mockResolvedValue({ id: 'me-5', accepted_state: 'ACCEPTED', billable_state: 'NON_BILLABLE' });
    prismaMock.usageRecord.create.mockResolvedValue({ id: 'ur-2', billable_quantity: 0 });

    const result = await service.recordEvent({ ...baseDto, isPlatformGenerated: true });

    expect(result.usageRecord).toBeTruthy();
    expect(prismaMock.usageRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ billable_quantity: 0 }) }),
    );
  });

  it('a NEVER_BILLABLE meter policy forces every event on it to NON_BILLABLE', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue({ ...definition, billable_policy: 'NEVER_BILLABLE' });
    prismaMock.meterEvent.findFirst.mockResolvedValue(null);
    prismaMock.meterEvent.create.mockResolvedValue({ id: 'me-6', accepted_state: 'ACCEPTED', billable_state: 'NON_BILLABLE' });
    prismaMock.usageRecord.create.mockResolvedValue({ id: 'ur-3', billable_quantity: 0 });

    await service.recordEvent(baseDto);

    expect(prismaMock.usageRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ billable_quantity: 0 }) }),
    );
  });
});
