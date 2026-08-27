import { CortexXdrNormalizerService } from './cortex-xdr.normalizer';
import { CortexXdrProvider } from './cortex-xdr.provider';
import { CortexXdrIncident } from './cortex-xdr.types';
import { ConnectorContext } from '../../core/connector-context';

describe('CortexXdrProvider and CortexXdrNormalizerService', () => {
  let normalizer: CortexXdrNormalizerService;
  let provider: CortexXdrProvider;

  const mockContext: ConnectorContext = {
    connectorInstanceId: 'conn-cortex-01',
    tenantId: 'tenant-enterprise-123',
    environmentId: 'production',
    region: 'us-east-1',
    purpose: 'EDR Ingestion',
    correlationId: 'corr-12345',
    traceId: 'trace-12345',
  };

  beforeEach(() => {
    normalizer = new CortexXdrNormalizerService();
    provider = new CortexXdrProvider(normalizer);
  });

  it('should connect and report healthy status', async () => {
    const connResult = await provider.connect(mockContext, {
      apiUrl: 'https://api-us.xdr.paloaltonetworks.com',
    });
    expect(connResult.status).toBe('CONNECTED');
    expect(connResult.provider).toBe('palo-alto-cortex-xdr');

    const health = await provider.testConnection(mockContext);
    expect(health.status).toBe('HEALTHY');
    expect(health.latencyMs).toBeGreaterThan(0);
  });

  it('should normalize a multi-alert Cortex XDR incident into OCSF findings (Class 2001)', async () => {
    const mockIncident: CortexXdrIncident = {
      incident_id: 'INC-88912',
      creation_time: 1718000000000,
      modification_time: 1718000500000,
      status: 'under_investigation',
      severity: 'critical',
      description: 'Multi-stage ransomware lateral movement detected',
      alert_count: 2,
      hosts: ['srv-domain-controller-01', 'ws-exec-laptop-14'],
      users: ['CORP\\svc-backup-admin'],
      alerts: [
        {
          alert_id: 'ALT-991',
          detector_id: 'PANW-Analytics',
          name: 'Suspicious PowerShell Download Cradle',
          category: 'INITIAL_ACCESS',
          severity: 'high',
          description: 'PowerShell executed with hidden window downloading remote payload',
          event_timestamp: 1718000000000,
          source: 'XDR_AGENT',
          host_name: 'ws-exec-laptop-14',
          host_ip: '10.100.4.15',
          user_name: 'CORP\\alice.smith',
          action_taken: 'BLOCKED',
          mitre_tactic_id_and_name: ['Execution', 'Command and Scripting Interpreter'],
          mitre_technique_id_and_name: ['T1059.001'],
          causality_actor_process_image_name: 'powershell.exe',
          causality_actor_process_command_line: 'powershell.exe -ExecutionPolicy Bypass -enc SQBFAFg...',
          causality_actor_process_sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
        },
        {
          alert_id: 'ALT-992',
          detector_id: 'PANW-BTP',
          name: 'VSS Shadow Copy Deletion',
          category: 'IMPACT',
          severity: 'critical',
          description: 'vssadmin.exe used to delete volume shadow copies',
          event_timestamp: 1718000100000,
          source: 'XDR_AGENT',
          host_name: 'srv-domain-controller-01',
          host_ip: '10.100.0.5',
          user_name: 'CORP\\svc-backup-admin',
          action_taken: 'DETECTED',
          mitre_tactic_id_and_name: ['Impact', 'Inhibit System Recovery'],
          mitre_technique_id_and_name: ['T1490'],
          causality_actor_process_image_name: 'vssadmin.exe',
          causality_actor_process_command_line: 'vssadmin.exe delete shadows /all /quiet',
        },
      ],
    };

    const result = await provider.ingestIncident(mockContext, mockIncident);
    expect(result.status).toBe('INGESTED');
    expect(result.findings.length).toBe(2);

    const firstFinding = result.findings[0];
    expect(firstFinding.class_uid).toBe(2001);
    expect(firstFinding.finding.title).toBe('Suspicious PowerShell Download Cradle');
    expect(firstFinding.finding.severity).toBe('HIGH');
    expect(firstFinding.device?.hostname).toBe('ws-exec-laptop-14');
    expect(firstFinding.process?.name).toBe('powershell.exe');
    expect(firstFinding.process?.file?.hashes[0].value).toBe(
      '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    );

    const secondFinding = result.findings[1];
    expect(secondFinding.finding.severity).toBe('CRITICAL');
    expect(secondFinding.device?.hostname).toBe('srv-domain-controller-01');
    expect(secondFinding.finding.attacks?.[0].technique.name).toBe('T1490');
  });
});
