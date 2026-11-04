import { NotFoundException } from '@nestjs/common';
import { QuarantineService } from './quarantine.service';
import { DlqReplayQuarantineService } from '../dlq/dlq-replay-quarantine.service';
import { createFakeDlqDb, FakeDlqDb } from '../../test/fakes/fake-dlq-db';

describe('QuarantineService (Ingestion DLQ & Error Isolation)', () => {
  let db: FakeDlqDb;
  let republish: jest.Mock;
  let service: QuarantineService;

  const build = () =>
    new QuarantineService(
      new DlqReplayQuarantineService(db as any, { republish } as any),
    );

  beforeEach(() => {
    db = createFakeDlqDb();
    republish = jest.fn();
    service = build();
  });

  it('persists a malformed payload as a NORMALIZATION DLQ row with a SHA-256 payload hash', async () => {
    const record = await service.quarantine({
      tenantId: 'tenant-1',
      environmentId: 'env-prod',
      connectorId: 'conn-aws-01',
      sourceEventId: 'evt-bad-1',
      rawPayload: '{"malformed": "json, missing brace',
      failureReason: 'PARSER_EXCEPTION',
      errorMessage: 'Unexpected end of JSON input',
    });

    expect(record).toMatchObject({
      status: 'PENDING_REVIEW',
      failureReason: 'PARSER_EXCEPTION',
      connectorId: 'conn-aws-01',
      environmentId: 'env-prod',
      sourceEventId: 'evt-bad-1',
    });
    expect(record.payloadHash).toHaveLength(64);
    expect(db.rows[0]).toMatchObject({
      source_kind: 'NORMALIZATION',
      source: 'normalization:conn-aws-01',
      connector_id: null,
    });

    const fetched = await service.getQuarantinedEvent(
      'tenant-1',
      record.quarantineId,
    );
    expect(fetched.rawPayload).toBe('{"malformed": "json, missing brace');
  });

  it('survives a restart: a fresh instance on the same database still lists the event', async () => {
    const record = await service.quarantine({
      tenantId: 'tenant-1',
      environmentId: 'env-prod',
      connectorId: 'conn-syslog-01',
      rawPayload: '<bad syslog>',
      failureReason: 'SCHEMA_MISMATCH',
      errorMessage: 'Invalid facility header',
    });

    const listed = await build().listQuarantinedEvents('tenant-1');
    expect(listed.map((r) => r.quarantineId)).toEqual([record.quarantineId]);
  });

  it('never auto-replays a normalizer rejection through a connector route', async () => {
    const record = await service.quarantine({
      tenantId: 'tenant-1',
      environmentId: 'env-prod',
      connectorId: 'aws-cloudtrail',
      rawPayload: '{}',
      failureReason: 'SCHEMA_MISMATCH',
      errorMessage: 'bad',
    });
    const dlq = new DlqReplayQuarantineService(db as any, { republish } as any);
    const reingest = jest.fn();
    dlq.setReingestHandler(reingest);

    const replay = await dlq.replayMessage('tenant-1', record.quarantineId);
    expect(replay.success).toBe(false);
    expect(reingest).not.toHaveBeenCalled();
    expect(republish).not.toHaveBeenCalled();
  });

  it('discards by keeping an auditable PURGED row', async () => {
    const record = await service.quarantine({
      tenantId: 'tenant-1',
      environmentId: 'env-prod',
      connectorId: 'conn-1',
      rawPayload: 'bad',
      failureReason: 'UNKNOWN',
      errorMessage: 'Error',
    });
    await service.discard('tenant-1', record.quarantineId);

    expect(
      (await service.getQuarantinedEvent('tenant-1', record.quarantineId))
        .status,
    ).toBe('DISCARDED');
    expect(await service.listQuarantinedEvents('tenant-1')).toHaveLength(0);
  });

  it('blocks cross-tenant access to quarantined events', async () => {
    const record = await service.quarantine({
      tenantId: 'tenant-1',
      environmentId: 'env-prod',
      connectorId: 'conn-1',
      rawPayload: 'bad data',
      failureReason: 'UNKNOWN',
      errorMessage: 'Error',
    });

    await expect(
      service.getQuarantinedEvent('tenant-2', record.quarantineId),
    ).rejects.toThrow(NotFoundException);
  });
});
