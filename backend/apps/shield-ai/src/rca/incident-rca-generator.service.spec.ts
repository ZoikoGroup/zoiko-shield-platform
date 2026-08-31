import { IncidentRcaGeneratorService } from './incident-rca-generator.service';

describe('IncidentRcaGeneratorService', () => {
  let rcaService: IncidentRcaGeneratorService;

  beforeEach(() => {
    rcaService = new IncidentRcaGeneratorService();
  });

  it('should synthesize multi-vector security events into structured RCA report with MITRE mappings and timeline', () => {
    const input = {
      incidentId: 'inc-p1-ransomware-attempt',
      tenantId: 'tenant-enterprise-01',
      title: 'Active Ransomware Infiltration Attempt',
      severity: 'CRITICAL' as const,
      events: [
        {
          eventId: 'evt-01',
          timestamp: '2026-08-31T09:00:00.000Z',
          source: 'okta-idp',
          eventType: 'MFA_FATIGUE_ATTEMPT',
          actor: 'compromised.admin@enterprise.com',
          targetResource: 'idp-sso-gateway',
          details: { ip: '198.51.100.22' },
        },
        {
          eventId: 'evt-02',
          timestamp: '2026-08-31T09:05:00.000Z',
          source: 'ebpf-kernel-probe',
          eventType: 'SUSPICIOUS_EXECVE_POWERSHELL',
          actor: 'compromised.admin@enterprise.com',
          targetResource: 'host-production-worker-01',
          details: { cmd: 'powershell.exe -enc ...' },
        },
        {
          eventId: 'evt-03',
          timestamp: '2026-08-31T09:10:00.000Z',
          source: 'crowdstrike-edr',
          eventType: 'LATERAL_SMB_INSPECTION',
          actor: 'compromised.admin@enterprise.com',
          targetResource: 'pod-payment-vault',
          details: { port: 445 },
        },
      ],
      attackGraphPath: ['host-production-worker-01', 'pod-payment-vault'],
    };

    const report = rcaService.generateIncidentRca(input);

    expect(report.rcaId).toBeDefined();
    expect(report.incidentId).toBe('inc-p1-ransomware-attempt');
    expect(report.rootCauseHypothesis).toContain('MFA_FATIGUE_ATTEMPT');
    expect(report.timelineChronology.length).toBe(3);
    expect(report.mitreMappings.length).toBeGreaterThanOrEqual(2);
    expect(report.identifiedBlastRadius.compromisedAccounts).toContain(
      'compromised.admin@enterprise.com',
    );
    expect(report.identifiedBlastRadius.affectedHosts).toContain(
      'host-production-worker-01',
    );
    expect(report.identifiedBlastRadius.isolatedPods).toContain(
      'pod-payment-vault',
    );
    expect(report.containmentRecommendations.length).toBeGreaterThan(0);
    expect(report.provenanceAttestationDigest).toBeDefined();
  });
});
