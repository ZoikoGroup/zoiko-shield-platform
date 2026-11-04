import { DLQReplayWorker } from './dlq-replay.worker';
import { DlqReplayQuarantineService } from '../dlq/dlq-replay-quarantine.service';
import { createFakeDlqDb, FakeDlqDb } from '../../test/fakes/fake-dlq-db';

describe('DLQReplayWorker', () => {
  let db: FakeDlqDb;
  let republish: jest.Mock;
  let dlq: DlqReplayQuarantineService;
  let worker: DLQReplayWorker;

  const kafka = (topic: string) => ({
    kind: 'KAFKA' as const,
    kafka: { topic },
  });

  beforeEach(() => {
    db = createFakeDlqDb();
    republish = jest.fn().mockResolvedValue(undefined);
    dlq = new DlqReplayQuarantineService(db as any, { republish } as any);
    worker = new DLQReplayWorker(dlq);
  });

  it('replays persisted Kafka messages and counts only real successes', async () => {
    await dlq.quarantineMessage(
      'tenant-1',
      't1',
      { a: 1 },
      'bad',
      'E',
      3,
      kafka('t1'),
    );
    await dlq.quarantineMessage(
      'tenant-1',
      't2',
      { a: 2 },
      'bad',
      'E',
      3,
      kafka('t2'),
    );

    const result = await worker.replayQuarantineBatch('tenant-1');

    expect(result).toMatchObject({
      totalProcessed: 2,
      replayedCount: 2,
      failedCount: 0,
    });
    expect(republish).toHaveBeenCalledTimes(2);
    expect(db.rows.every((r) => r.status === 'REPLAY_SUCCESS')).toBe(true);
  });

  it('records publish failures and leaves the message for the next sweep', async () => {
    await dlq.quarantineMessage(
      'tenant-1',
      't1',
      { a: 1 },
      'bad',
      'E',
      3,
      kafka('t1'),
    );
    republish.mockRejectedValueOnce(new Error('broker down'));

    const result = await worker.replayQuarantineBatch('tenant-1');

    expect(result.failedCount).toBe(1);
    expect(result.errors[0].error).toBe('broker down');
    expect(db.rows[0].status).toBe('QUARANTINED');
  });

  it('never auto-replays webhook or normalizer rows, which cannot succeed unattended', async () => {
    await dlq.quarantineMessage(
      'tenant-1',
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
    await dlq.quarantineMessage(
      'tenant-1',
      'normalization:aws-cloudtrail',
      { a: 2 },
      'bad',
      'E',
      1,
      {
        kind: 'NORMALIZATION',
      },
    );
    const reingest = jest.fn();
    dlq.setReingestHandler(reingest);

    const result = await worker.replayQuarantineBatch('tenant-1');

    expect(result.totalProcessed).toBe(0);
    expect(reingest).not.toHaveBeenCalled();
    expect(db.rows.every((r) => r.status === 'QUARANTINED')).toBe(true);
  });

  it('respects the batch limit', async () => {
    for (let i = 0; i < 5; i++) {
      await dlq.quarantineMessage(
        'tenant-1',
        `t${i}`,
        { i },
        'bad',
        'E',
        3,
        kafka(`t${i}`),
      );
    }
    const result = await worker.replayQuarantineBatch('tenant-1', 2);
    expect(result.totalProcessed).toBe(2);
    expect(republish).toHaveBeenCalledTimes(2);
  });

  describe('autoRetryQuarantinedWorker', () => {
    it('sweeps every tenant with replayable messages, isolated per tenant', async () => {
      await dlq.quarantineMessage(
        'tenant-a',
        't',
        { a: 1 },
        'bad',
        'E',
        3,
        kafka('t'),
      );
      await dlq.quarantineMessage(
        'tenant-b',
        't',
        { b: 1 },
        'bad',
        'E',
        3,
        kafka('t'),
      );

      await worker.autoRetryQuarantinedWorker();

      expect(republish).toHaveBeenCalledWith('t', 'tenant-a', { a: 1 });
      expect(republish).toHaveBeenCalledWith('t', 'tenant-b', { b: 1 });
    });

    it('does not run two sweeps at once', async () => {
      await dlq.quarantineMessage(
        'tenant-a',
        't',
        { a: 1 },
        'bad',
        'E',
        3,
        kafka('t'),
      );
      const listSpy = jest.spyOn(dlq, 'listTenantsWithQuarantine');

      await Promise.all([
        worker.autoRetryQuarantinedWorker(),
        worker.autoRetryQuarantinedWorker(),
      ]);

      expect(listSpy).toHaveBeenCalledTimes(1);
    });

    it('logs and swallows a sweep failure instead of crashing the scheduler', async () => {
      jest
        .spyOn(dlq, 'listTenantsWithQuarantine')
        .mockRejectedValueOnce(new Error('db down'));
      await expect(
        worker.autoRetryQuarantinedWorker(),
      ).resolves.toBeUndefined();
    });
  });
});
