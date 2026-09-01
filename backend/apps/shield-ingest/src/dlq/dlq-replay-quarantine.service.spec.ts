import { Test, TestingModule } from '@nestjs/testing';
import { DlqReplayQuarantineService } from './dlq-replay-quarantine.service';

describe('DlqReplayQuarantineService', () => {
  let service: DlqReplayQuarantineService;
  const tenantId = 'tenant-dlq-test-103';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DlqReplayQuarantineService],
    }).compile();

    service = module.get<DlqReplayQuarantineService>(
      DlqReplayQuarantineService,
    );
  });

  it('should quarantine a malformed event and track metrics', () => {
    const quarantined = service.quarantineMessage(
      tenantId,
      'telemetry.edr.events',
      { rawString: 'CORRUPTED_HEX_BUFFER', isCorrupt: true },
      'Malformed UTF-8 payload',
      'CORRUPT_BUFFER',
    );

    expect(quarantined.messageId).toContain('dlq-');
    expect(quarantined.status).toBe('QUARANTINED');

    const list = service.listQuarantined(tenantId);
    expect(list.length).toBe(1);
    expect(list[0].errorCode).toBe('CORRUPT_BUFFER');
  });

  it('should replay a quarantined event after transformation hook fix', async () => {
    const quarantined = service.quarantineMessage(
      tenantId,
      'telemetry.syslog.events',
      { host: 'srv-01', missingTimestamp: true },
      'Missing ISO8601 timestamp',
      'SCHEMA_INVALID',
    );

    // Replay with transformation hook to inject valid timestamp
    const replayResult = await service.replayMessage(
      tenantId,
      quarantined.messageId,
      (payload) => ({
        ...payload,
        timestamp: new Date().toISOString(),
        isCorrupt: false,
      }),
    );

    expect(replayResult.success).toBe(true);
    expect(replayResult.status).toBe('REPLAY_SUCCESS');

    const metrics = service.getMetrics();
    expect(metrics.replayedSuccess).toBe(1);
    expect(metrics.activeQuarantined).toBe(0);
  });
});
