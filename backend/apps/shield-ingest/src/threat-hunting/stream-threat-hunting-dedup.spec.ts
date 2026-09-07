import { Test, TestingModule } from '@nestjs/testing';
import { StreamThreatHuntingService } from './stream-threat-hunting.service';
import { StreamDeduplicationService } from '../deduplication/stream-deduplication.service';

describe('StreamThreatHuntingService & Deduplication (LAB 19 Real-Time Stream Threat Hunting)', () => {
  let huntingService: StreamThreatHuntingService;
  let dedupService: StreamDeduplicationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StreamThreatHuntingService, StreamDeduplicationService],
    }).compile();

    huntingService = module.get<StreamThreatHuntingService>(
      StreamThreatHuntingService,
    );
    dedupService = module.get<StreamDeduplicationService>(
      StreamDeduplicationService,
    );
  });

  describe('In-Flight Stream Threat Hunting', () => {
    it('should ingest security events into ring buffer and query by process name pattern', () => {
      huntingService.ingestToStreamBuffer({
        eventId: 'evt-01',
        tenantId: 'tenant-alpha',
        classUid: 1001,
        severityId: 4,
        actor: {
          userName: 'admin-alice',
          processName: 'powershell.exe -ExecutionPolicy Bypass -Enc JAB',
          sourceIp: '192.168.1.50',
        },
        rawPayload: { command: 'mimikatz.ps1' },
        timestampEpochMs: Date.now(),
      });

      huntingService.ingestToStreamBuffer({
        eventId: 'evt-02',
        tenantId: 'tenant-alpha',
        classUid: 1001,
        severityId: 1,
        actor: {
          userName: 'service-bob',
          processName: 'nginx.exe',
          sourceIp: '10.0.0.5',
        },
        rawPayload: { uri: '/index.html' },
        timestampEpochMs: Date.now(),
      });

      const matches = huntingService.executeQuery({
        queryId: 'hunt-powershell-bypass',
        queryName: 'Suspicious Encoded PowerShell Execution',
        processNamePattern: 'powershell.exe',
        minSeverityId: 3,
      });

      expect(matches).toHaveLength(1);
      expect(matches[0].matchingEvent.eventId).toBe('evt-01');
      expect(matches[0].processingLatencyMs).toBeLessThan(100);
      expect(matches[0].queryDigest).toHaveLength(64);
    });

    it('should match multiple in-flight events matching source IP and user name predicates', () => {
      huntingService.ingestToStreamBuffer({
        eventId: 'evt-10',
        tenantId: 'tenant-beta',
        classUid: 3002,
        severityId: 5,
        actor: {
          userName: 'root',
          processName: '/bin/bash',
          sourceIp: '203.0.113.88',
        },
        rawPayload: { action: 'SSH_LOGIN' },
        timestampEpochMs: Date.now(),
      });

      const matches = huntingService.executeQuery({
        queryId: 'hunt-external-ssh-root',
        queryName: 'External SSH Login as Root',
        sourceIpPattern: '203.0.113.',
        userNamePattern: 'root',
      });

      expect(matches).toHaveLength(1);
      expect(matches[0].matchingEvent.actor.sourceIp).toBe('203.0.113.88');
    });
  });

  describe('Stream Deduplication & Bloom Filter', () => {
    it('should accept first unique event and discard subsequent identical burst duplicates', () => {
      const tenantId = 'tenant-gamma';
      const eventType = 'AUTH_FAILED_BURST';
      const rawPayload = {
        username: 'attacker',
        srcIp: '198.51.100.99',
        attempt: 1,
      };

      const firstCheck = dedupService.checkAndRegister(
        tenantId,
        eventType,
        rawPayload,
      );
      expect(firstCheck.isDuplicate).toBe(false);

      // Subsequent duplicate in the same sliding window
      const secondCheck = dedupService.checkAndRegister(
        tenantId,
        eventType,
        rawPayload,
      );
      expect(secondCheck.isDuplicate).toBe(true);
      expect(secondCheck.fingerprint).toBe(firstCheck.fingerprint);

      const metrics = dedupService.getMetrics();
      expect(metrics.uniqueIngested).toBe(1);
      expect(metrics.duplicatesDiscarded).toBe(1);
      expect(metrics.deduplicationRatio).toBe(0.5);
    });
  });
});
