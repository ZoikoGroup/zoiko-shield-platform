import { RawIngestService } from './raw-ingest.service';

const connector = {
  id: 'conn-1',
  tenant_id: 'tenant-1',
  environment_id: 'env-1',
  authentication_type: 'WEBHOOK_SECRET',
  source_region: 'us-east-1',
};
const RECEIVED = new Date('2026-11-27T13:34:39.749Z');

function build(over: { connector?: unknown; health?: unknown } = {}) {
  const prisma: any = {
    connectorInstance: { findUnique: jest.fn().mockResolvedValue(over.connector ?? connector) },
    rawEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({
        id: 'raw-1',
        tenant_id: data.tenant_id,
        environment_id: data.environment_id,
        connector_id: data.connector_id,
        source_event_id: data.source_event_id ?? null,
        payload_hash: data.payload_hash,
        processing_status: data.processing_status,
        source_type: data.source_type,
        received_at: RECEIVED,
      })),
    },
  };
  const kafka: any = { emit: jest.fn().mockResolvedValue(true) };
  const health: any = over.health ?? { recordWebhookDelivery: jest.fn().mockResolvedValue(undefined) };
  const service = new RawIngestService(prisma, kafka, undefined, undefined, undefined, undefined, health);
  return { service, health, prisma };
}

describe('RawIngestService: an accepted delivery is recorded as connector health', () => {
  it('records the delivery time against the connector and tenant', async () => {
    const { service, health } = build();
    const r = await service.processWebhookPayload('conn-1', {}, { eventId: 'e1', action: 'push' });
    expect(r.processingStatus).toBe('ACCEPTED');
    expect(health.recordWebhookDelivery).toHaveBeenCalledWith('conn-1', 'tenant-1', RECEIVED);
  });

  it('does not count a quarantined delivery as proof the connector works', async () => {
    const { service, health } = build();
    const r = await service.processWebhookPayload('conn-1', {}, {}); // empty payload is quarantined
    expect(r.processingStatus).toBe('QUARANTINED');
    expect(health.recordWebhookDelivery).not.toHaveBeenCalled();
  });

  it('does not count a duplicate', async () => {
    const { service, health, prisma } = build();
    prisma.rawEvent.findFirst.mockResolvedValue({
      id: 'raw-0',
      tenant_id: 'tenant-1',
      environment_id: 'env-1',
      connector_id: 'conn-1',
      source_event_id: 'e1',
      payload_hash: 'h',
      received_at: RECEIVED,
    });
    const r = await service.processWebhookPayload('conn-1', {}, { eventId: 'e1' });
    expect(r.processingStatus).toBe('DUPLICATE_IGNORED');
    expect(health.recordWebhookDelivery).not.toHaveBeenCalled();
  });

  it('a health-write failure never turns an accepted delivery into a failed one', async () => {
    const { service } = build({ health: { recordWebhookDelivery: jest.fn().mockRejectedValue(new Error('db down')) } });
    const r = await service.processWebhookPayload('conn-1', {}, { eventId: 'e2', action: 'push' });
    expect(r.processingStatus).toBe('ACCEPTED');
  });

  it('works unchanged where no health service is wired', async () => {
    const prisma: any = {
      connectorInstance: { findUnique: jest.fn().mockResolvedValue(connector) },
      rawEvent: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'r', tenant_id: 't', environment_id: 'e', connector_id: 'c', payload_hash: 'h', processing_status: 'ACCEPTED', source_type: 'x', received_at: RECEIVED }) },
    };
    const service = new RawIngestService(prisma, { emit: jest.fn() } as any);
    await expect(service.processWebhookPayload('conn-1', {}, { eventId: 'e3', a: 1 })).resolves.toMatchObject({ processingStatus: 'ACCEPTED' });
  });
});
