import {
  ClickhouseAnalyticalDetectorService,
  SecurityEventRecord,
} from './clickhouse-analytical-detector.service';

describe('ClickhouseAnalyticalDetectorService (LAB 09 Parameterized Analytical Queries)', () => {
  let chService: ClickhouseAnalyticalDetectorService;

  beforeEach(() => {
    chService = new ClickhouseAnalyticalDetectorService();
  });

  it('should insert partitioned events and query within strict tenant boundaries', () => {
    const tenantA = 'tenant-corp-alpha';
    const tenantB = 'tenant-corp-beta';

    const events: SecurityEventRecord[] = [
      {
        tenantId: tenantA,
        eventTime: '2026-08-31T10:00:00.000Z',
        eventId: 'evt-a-1',
        className: 'NetworkActivity',
        activityId: 101,
        severity: 3,
        actorId: '10.0.1.5',
        targetId: 'db-prod-01',
        payloadJson: '{}',
        schemaVersion: '1.2.0',
      },
      {
        tenantId: tenantA,
        eventTime: '2026-08-31T10:05:00.000Z',
        eventId: 'evt-a-2',
        className: 'NetworkActivity',
        activityId: 101,
        severity: 3,
        actorId: '10.0.1.5',
        targetId: 'db-prod-01',
        payloadJson: '{}',
        schemaVersion: '1.2.0',
      },
      {
        tenantId: tenantA,
        eventTime: '2026-08-31T10:10:00.000Z',
        eventId: 'evt-a-3',
        className: 'NetworkActivity',
        activityId: 101,
        severity: 4,
        actorId: '10.0.1.5',
        targetId: 'db-prod-01',
        payloadJson: '{}',
        schemaVersion: '1.2.0',
      },
      // Tenant B event
      {
        tenantId: tenantB,
        eventTime: '2026-08-31T10:12:00.000Z',
        eventId: 'evt-b-1',
        className: 'NetworkActivity',
        activityId: 101,
        severity: 4,
        actorId: '10.0.1.5',
        targetId: 'db-prod-01',
        payloadJson: '{}',
        schemaVersion: '1.2.0',
      },
    ];

    const insertRes = chService.insertEvents(events);
    expect(insertRes.insertedCount).toBe(4);
    expect(insertRes.partitions).toContain(`${tenantA}:202608`);

    // Execute parameterized detection for Tenant A
    const finding = chService.executeParameterizedDetection(
      {
        tenantId: tenantA,
        timeRangeStart: '2026-08-31T09:00:00.000Z',
        timeRangeEnd: '2026-08-31T11:00:00.000Z',
        className: 'NetworkActivity',
        actorId: '10.0.1.5',
        limit: 100,
      },
      'ZS-TIER-B-LATERAL-BURST-001',
    );

    expect(finding.totalScannedEvents).toBe(3); // Never scans Tenant B partition
    expect(finding.matchedEventIds).toHaveLength(3);
    expect(finding.matchedEventIds).not.toContain('evt-b-1');
    expect(finding.severity).toBe('HIGH');
  });

  it('should throw error if tenantId is missing from query specification', () => {
    expect(() => {
      chService.executeParameterizedDetection(
        {
          tenantId: '',
          timeRangeStart: '2026-08-31T00:00:00.000Z',
          timeRangeEnd: '2026-08-31T23:59:59.000Z',
          limit: 10,
        },
        'RULE-1',
      );
    }).toThrow('LAB 09 Invariant Violation');
  });
});
