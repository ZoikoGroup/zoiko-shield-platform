import { NotFoundException } from '@nestjs/common';
import { DlqReplayQuarantineService } from './dlq-replay-quarantine.service';
import { createFakeDlqDb, FakeDlqDb } from '../../test/fakes/fake-dlq-db';

describe('DlqReplayQuarantineService', () => {
  const tenantId = 'tenant-dlq-test-103';
  let db: FakeDlqDb;
  let republish: jest.Mock;
  let service: DlqReplayQuarantineService;

  const kafkaOrigin = {
    kind: 'KAFKA' as const,
    kafka: { topic: 'telemetry.edr.events', partition: 2, offset: '1042' },
  };

  beforeEach(() => {
    db = createFakeDlqDb();
    republish = jest.fn().mockResolvedValue(undefined);
    service = new DlqReplayQuarantineService(db as any, { republish } as any);
  });

  it('persists a quarantined message with its Kafka origin', async () => {
    const quarantined = await service.quarantineMessage(
      tenantId,
      'telemetry.edr.events',
      { rawString: 'CORRUPTED_HEX_BUFFER' },
      'Malformed UTF-8 payload',
      'CORRUPT_BUFFER',
      3,
      kafkaOrigin,
    );

    expect(quarantined.status).toBe('QUARANTINED');
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({
      tenant_id: tenantId,
      kafka_topic: 'telemetry.edr.events',
      kafka_partition: 2,
      kafka_offset: '1042',
    });

    const list = await service.listQuarantined(tenantId);
    expect(list.map((m) => m.errorCode)).toEqual(['CORRUPT_BUFFER']);
  });

  it('survives a restart: a fresh instance on the same database still sees the message', async () => {
    const quarantined = await service.quarantineMessage(
      tenantId,
      't',
      { a: 1 },
      'bad',
      'E',
      3,
      kafkaOrigin,
    );
    const restarted = new DlqReplayQuarantineService(
      db as any,
      { republish } as any,
    );

    const list = await restarted.listQuarantined(tenantId);
    expect(list.map((m) => m.messageId)).toEqual([quarantined.messageId]);
  });

  it('does not duplicate an identical active message', async () => {
    await service.quarantineMessage(
      tenantId,
      't',
      { a: 1 },
      'bad',
      'E',
      3,
      kafkaOrigin,
    );
    await service.quarantineMessage(
      tenantId,
      't',
      { a: 1 },
      'bad',
      'E',
      3,
      kafkaOrigin,
    );
    expect(db.rows).toHaveLength(1);
  });

  it('re-publishes the transformed payload to the original topic and marks success only afterwards', async () => {
    const quarantined = await service.quarantineMessage(
      tenantId,
      'telemetry.edr.events',
      { host: 'srv-01', missingTimestamp: true },
      'Missing timestamp',
      'SCHEMA_VALIDATION_ERROR',
      3,
      kafkaOrigin,
    );
    republish.mockImplementation(async () => {
      expect(db.rows[0].status).toBe('REPLAYING');
    });

    const result = await service.replayMessage(
      tenantId,
      quarantined.messageId,
      (p) => ({
        ...p,
        timestamp: '2026-11-03T00:00:00.000Z',
      }),
    );

    expect(result).toMatchObject({ success: true, status: 'REPLAY_SUCCESS' });
    expect(republish).toHaveBeenCalledWith('telemetry.edr.events', tenantId, {
      host: 'srv-01',
      missingTimestamp: true,
      timestamp: '2026-11-03T00:00:00.000Z',
    });
    expect(db.rows[0].status).toBe('REPLAY_SUCCESS');
  });

  it('publishes once when two replays of one message race', async () => {
    const quarantined = await service.quarantineMessage(
      tenantId,
      't',
      { a: 1 },
      'bad',
      'E',
      3,
      kafkaOrigin,
    );
    const other = new DlqReplayQuarantineService(
      db as any,
      { republish } as any,
    );

    const results = await Promise.all([
      service.replayMessage(tenantId, quarantined.messageId),
      other.replayMessage(tenantId, quarantined.messageId),
    ]);

    expect(republish).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.success)).toHaveLength(1);
  });

  it('does not re-send a message that already replayed successfully', async () => {
    const quarantined = await service.quarantineMessage(
      tenantId,
      't',
      { a: 1 },
      'bad',
      'E',
      3,
      kafkaOrigin,
    );
    await service.replayMessage(tenantId, quarantined.messageId);
    const again = await service.replayMessage(tenantId, quarantined.messageId);

    expect(again.success).toBe(true);
    expect(republish).toHaveBeenCalledTimes(1);
  });

  it('leaves a message replayable after a publish failure, then fails it at max attempts', async () => {
    const quarantined = await service.quarantineMessage(
      tenantId,
      't',
      { a: 1 },
      'bad',
      'E',
      2,
      kafkaOrigin,
    );
    republish.mockRejectedValue(new Error('broker unavailable'));

    const first = await service.replayMessage(tenantId, quarantined.messageId);
    expect(first).toMatchObject({
      success: false,
      status: 'QUARANTINED',
      error: 'broker unavailable',
    });
    expect(db.rows[0].status).toBe('QUARANTINED');

    const second = await service.replayMessage(tenantId, quarantined.messageId);
    expect(second.status).toBe('REPLAY_FAILED');
    expect(db.rows[0].attempt_count).toBe(2);
  });

  it('treats a webhook re-ingest that is not ACCEPTED as a failure', async () => {
    const quarantined = await service.quarantineMessage(
      tenantId,
      'webhook',
      { a: 1 },
      'bad',
      'E',
      3,
      {
        kind: 'WEBHOOK',
        connectorId: 'conn-1',
      },
    );
    service.setReingestHandler(async () => ({
      processingStatus: 'DUPLICATE_IGNORED',
    }));

    const result = await service.replayMessage(tenantId, quarantined.messageId);
    expect(result.success).toBe(false);
    expect(result.error).toContain('DUPLICATE_IGNORED');
  });

  it('keeps a purged message as an auditable PURGED row', async () => {
    const quarantined = await service.quarantineMessage(
      tenantId,
      't',
      { a: 1 },
      'bad',
      'E',
      3,
      kafkaOrigin,
    );
    expect(
      await service.purgeQuarantined(tenantId, quarantined.messageId),
    ).toBe(true);
    expect(db.rows[0].status).toBe('PURGED');
    expect(await service.listQuarantined(tenantId)).toHaveLength(0);
  });

  it('isolates tenants and rejects unknown messages', async () => {
    const quarantined = await service.quarantineMessage(
      tenantId,
      't',
      { a: 1 },
      'bad',
      'E',
      3,
      kafkaOrigin,
    );
    await expect(
      service.replayMessage('tenant-other', quarantined.messageId),
    ).rejects.toThrow(NotFoundException);
    expect(await service.listQuarantined('tenant-other')).toHaveLength(0);
  });
});
