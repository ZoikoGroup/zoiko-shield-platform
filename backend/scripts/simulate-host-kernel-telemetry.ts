/**
 * Host Runtime Kernel Telemetry Ingest & Container Security Simulator
 * Specification: Backend Build Guide §LAB 12 (Host Runtime Security)
 */

import { HostRuntimeMonitorService } from '../apps/shield-ingest/src/runtime-monitor/host-runtime-monitor.service';

async function main() {
  console.log('\n================================================================');
  console.log(' 🛡️  ZoikoShield Host Runtime Telemetry & Container Simulator');
  console.log('    Specification: §12 (Host Runtime & Container Defense)');
  console.log('================================================================\n');

  const hostMonitorService = new HostRuntimeMonitorService();

  // 1. Process Benign Process Execution
  const benignFinding = hostMonitorService.processHostProbe({
    probeId: 'probe-host-ring-001',
    hostName: 'k8s-worker-node-01',
    containerId: 'container-payment-frontend',
    containerName: 'payment-frontend-pod',
    syscall: 'sys_enter_execve',
    pid: 1042,
    uid: 1000,
    binaryPath: '/usr/local/bin/node',
    commandLine: 'node dist/main.js',
    timestampEpochNs: Date.now() * 1000000,
  });

  console.log('✔ Normal Telemetry Event Processed:');
  console.log(`  - Finding ID: ${benignFinding.findingId}`);
  console.log(`  - Severity ID: ${benignFinding.severityId} (Informational)`);
  console.log(`  - Canonical Hash: ${benignFinding.canonicalHash}\n`);

  // 2. Process Process Injection (sys_enter_ptrace)
  const ptraceFinding = hostMonitorService.processHostProbe({
    probeId: 'probe-host-ring-002',
    hostName: 'k8s-worker-node-02',
    containerId: 'container-auth-service',
    containerName: 'auth-service-pod',
    syscall: 'sys_enter_ptrace',
    pid: 8821,
    uid: 0,
    targetPid: 1001,
    binaryPath: '/tmp/inject.so',
    commandLine: './inject --target 1001',
    timestampEpochNs: Date.now() * 1000000,
  });

  console.log('✔ Process Injection Detected:');
  console.log(`  - Finding ID: ${ptraceFinding.findingId}`);
  console.log(`  - Severity ID: ${ptraceFinding.severityId} (High)`);
  console.log(`  - Rule Triggered: ${ptraceFinding.threatDetails?.ruleName}\n`);

  // 3. Process Container Breakout Attack
  const breakoutFinding = hostMonitorService.processHostProbe({
    probeId: 'probe-host-ring-003',
    hostName: 'k8s-worker-node-03',
    containerId: 'container-compromised-worker',
    containerName: 'compromised-worker',
    syscall: 'container_escape_attempt',
    pid: 9912,
    uid: 0,
    binaryPath: '/nsenter',
    commandLine: '/nsenter -t 1 -m -u -i -n -p /bin/sh',
    timestampEpochNs: Date.now() * 1000000,
  });

  console.log('🚨 Critical Container Breakout Detected:');
  console.log(`  - Finding ID: ${breakoutFinding.findingId}`);
  console.log(`  - Severity ID: ${breakoutFinding.severityId} (Critical/Fatal)`);
  console.log(`  - MITRE Technique: ${breakoutFinding.threatDetails?.mitreTechniqueId}`);
  console.log(`  - Rule Name: ${breakoutFinding.threatDetails?.ruleName}\n`);

  console.log('================================================================');
  console.log(' 🎉 HOST RUNTIME PROBE TELEMETRY SIMULATION COMPLETED!');
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('❌ Host runtime simulation failed:', err);
  process.exit(1);
});
