import { EbpfRuntimeMonitorService } from './ebpf-runtime-monitor.service';

describe('EbpfRuntimeMonitorService', () => {
  let ebpfService: EbpfRuntimeMonitorService;

  beforeEach(() => {
    ebpfService = new EbpfRuntimeMonitorService();
  });

  it('should normalize standard Linux binary execution probe into OCSF Class 4001', () => {
    const finding = ebpfService.processEbpfProbe({
      probeId: 'ebpf-ringbuf-01',
      hostName: 'k8s-worker-node-04',
      syscall: 'sys_enter_execve',
      pid: 14201,
      uid: 1000,
      binaryPath: '/usr/bin/curl',
      commandLine: 'curl https://api.internal.service',
      timestampEpochNs: Date.now() * 1000000,
    });

    expect(finding.findingId).toBeDefined();
    expect(finding.classUid).toBe(4001);
    expect(finding.severityId).toBe(1);
    expect(finding.actor.process.binaryPath).toBe('/usr/bin/curl');
    expect(finding.canonicalHash).toBeDefined();
  });

  it('should detect container breakout attempt and emit Critical severity with MITRE T1611 mapping', () => {
    const finding = ebpfService.processEbpfProbe({
      probeId: 'ebpf-ringbuf-02',
      hostName: 'k8s-worker-node-04',
      containerId: 'cgroup-docker-9921',
      containerName: 'frontend-nginx-ingress',
      syscall: 'container_escape_attempt',
      pid: 19802,
      uid: 0,
      binaryPath: '/nsenter',
      commandLine: 'nsenter --target 1 --mount --uts --ipc --net --pid',
      timestampEpochNs: Date.now() * 1000000,
    });

    expect(finding.classUid).toBe(4002);
    expect(finding.severityId).toBe(6); // Critical
    expect(finding.threatDetails?.isBreakoutAttempt).toBe(true);
    expect(finding.threatDetails?.mitreTechniqueId).toBe('T1611');
  });
});
