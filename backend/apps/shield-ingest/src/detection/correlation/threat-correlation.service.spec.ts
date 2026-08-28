import {
  ThreatCorrelationService,
  SecurityTelemetryEvent,
} from './threat-correlation.service';

describe('ThreatCorrelationService', () => {
  let correlationService: ThreatCorrelationService;

  beforeEach(() => {
    correlationService = new ThreatCorrelationService();
  });

  it('should return empty list when given empty events array', () => {
    const results = correlationService.correlateTelemetryStream(
      'tenant-01',
      [],
    );
    expect(results).toEqual([]);
  });

  it('should ignore single isolated events with no correlation peers', () => {
    const singleEvent: SecurityTelemetryEvent = {
      eventId: 'evt-01',
      source: 'IDENTITY_OKTA',
      eventTime: Date.now(),
      principalUser: 'victim.user@enterprise.com',
      mitreTactic: 'Initial Access',
      rawSeverity: 'LOW',
      title: 'Suspicious Login Location',
      payload: {},
    };

    const results = correlationService.correlateTelemetryStream('tenant-01', [
      singleEvent,
    ]);
    expect(results.length).toBe(0);
  });

  it('should correlate multi-stage attack across Identity, Cloud, and EDR on the same entity', () => {
    const now = Date.now();
    const attackStream: SecurityTelemetryEvent[] = [
      {
        eventId: 'evt-01',
        source: 'IDENTITY_OKTA',
        eventTime: now,
        principalUser: 'victim.user@enterprise.com',
        mitreTactic: 'Initial Access',
        mitreTechnique: 'T1078.004',
        rawSeverity: 'MEDIUM',
        title: 'MFA Prompt Bombing Attack',
        payload: { ip: '198.51.100.5' },
      },
      {
        eventId: 'evt-02',
        source: 'AUDIT_CLOUDTRAIL',
        eventTime: now + 1000 * 60 * 5, // 5 mins later
        principalUser: 'victim.user@enterprise.com',
        mitreTactic: 'Privilege Escalation',
        mitreTechnique: 'T1098',
        rawSeverity: 'HIGH',
        title: 'IAM Admin Role Attachment',
        payload: { role: 'arn:aws:iam::123456789012:role/SuperAdmin' },
      },
      {
        eventId: 'evt-03',
        source: 'EDR_CORTEX',
        eventTime: now + 1000 * 60 * 10, // 10 mins later
        principalUser: 'victim.user@enterprise.com',
        targetHost: 'srv-prod-db-01.corp.internal',
        mitreTactic: 'Exfiltration',
        mitreTechnique: 'T1567',
        rawSeverity: 'CRITICAL',
        title: 'Unauthorized S3 Bucket Dump',
        payload: { bytes: 4500000000 },
      },
    ];

    const results = correlationService.correlateTelemetryStream(
      'tenant-01',
      attackStream,
      30,
    );
    expect(results.length).toBe(1);

    const inc = results[0];
    expect(inc.severity).toBe('CRITICAL');
    expect(inc.correlatedEventsCount).toBe(3);
    expect(inc.killChainStages).toContain('Initial Access');
    expect(inc.killChainStages).toContain('Privilege Escalation');
    expect(inc.killChainStages).toContain('Exfiltration');
    expect(inc.affectedEntities.users).toContain('victim.user@enterprise.com');
    expect(inc.recommendedPlaybook.requiredAuthority).toBe('R1');
    expect(inc.recommendedPlaybook.actions.length).toBeGreaterThan(0);
  });
});
