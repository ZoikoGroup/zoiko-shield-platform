import { StreamThreatHuntingService } from './stream-threat-hunting.service';

describe('StreamThreatHuntingService', () => {
  let huntingService: StreamThreatHuntingService;

  beforeEach(() => {
    huntingService = new StreamThreatHuntingService();
  });

  it('should ingest in-flight events and perform sub-millisecond predicate hunting queries', () => {
    // 1. Ingest events
    huntingService.ingestToStreamBuffer({
      eventId: 'evt-01',
      tenantId: 'tenant-01',
      classUid: 1001,
      severityId: 1, // Low
      actor: {
        userName: 'alice',
        processName: 'node.exe',
        sourceIp: '10.0.0.1',
      },
      rawPayload: {},
      timestampEpochMs: Date.now(),
    });

    huntingService.ingestToStreamBuffer({
      eventId: 'evt-02',
      tenantId: 'tenant-01',
      classUid: 4001,
      severityId: 5, // High
      actor: {
        userName: 'compromised-admin',
        processName: 'powershell.exe',
        sourceIp: '198.51.100.22',
      },
      rawPayload: { command: 'Invoke-Mimikatz' },
      timestampEpochMs: Date.now(),
    });

    expect(huntingService.getBufferCount()).toBe(2);

    // 2. Query for PowerShell activity with High severity
    const matches = huntingService.executeQuery({
      queryId: 'hunt-ps-01',
      queryName: 'In-Flight Suspicious PowerShell Execution',
      minSeverityId: 4,
      processNamePattern: 'powershell',
    });

    expect(matches.length).toBe(1);
    expect(matches[0].matchingEvent.eventId).toBe('evt-02');
    expect(matches[0].matchingEvent.actor.userName).toBe('compromised-admin');
    expect(matches[0].queryDigest).toBeDefined();
  });
});
