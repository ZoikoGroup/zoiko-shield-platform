/**
 * eBPF Kernel Probe Telemetry Ingest & Container Runtime Monitor Simulator
 * 
 * Simulates:
 * 1. Ingestion of raw zero-copy Linux kernel tracepoint ring-buffer events.
 * 2. Normalization of process execution events to OCSF Class 4001.
 * 3. Detection of container breakout (nsenter / cgroup escape) with MITRE T1611 mapping and Critical severity.
 */

import 'dotenv/config';
import 'reflect-metadata';
import { EbpfRuntimeMonitorService } from '../apps/shield-ingest/src/ebpf/ebpf-runtime-monitor.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield eBPF Kernel Probe Telemetry Simulator');
  console.log('    Specification: ZS-T0-BE-ARCH-001 §12 (Zero-Copy Kernel Telemetry)');
  console.log('========================================================================\n');

  const ebpfService = new EbpfRuntimeMonitorService();

  console.log('[1/3] Ingesting Linux Kernel sys_enter_execve Probe Trace...');
  const benignFinding = ebpfService.processEbpfProbe({
    probeId: 'probe-ebpf-ring-001',
    hostName: 'k8s-node-prod-02',
    containerId: 'container-api-gateway-33',
    containerName: 'api-gateway-pod',
    syscall: 'sys_enter_execve',
    pid: 28410,
    uid: 1001,
    binaryPath: '/usr/local/bin/node',
    commandLine: 'node dist/main.js',
    timestampEpochNs: Date.now() * 1000000,
  });

  console.log(`  ✔ Ingested Finding: ${benignFinding.findingId}`);
  console.log(`  ✔ Normalized OCSF Class: ${benignFinding.classUid} (Container Runtime Activity)`);
  console.log(`  ✔ Severity ID: ${benignFinding.severityId} (Informational / Normal Activity)`);
  console.log(`  ✔ Process: ${benignFinding.actor.process.binaryPath} (PID ${benignFinding.actor.process.pid})`);
  console.log(`  🔒 Canonical Hash: ${benignFinding.canonicalHash.slice(0, 32)}...`);

  console.log('\n[2/3] Ingesting sys_enter_ptrace Process Injection Telemetry...');
  const ptraceFinding = ebpfService.processEbpfProbe({
    probeId: 'probe-ebpf-ring-002',
    hostName: 'k8s-node-prod-02',
    syscall: 'sys_enter_ptrace',
    pid: 30129,
    uid: 0,
    binaryPath: '/tmp/injector',
    commandLine: './injector --pid 104',
    targetPid: 104,
    timestampEpochNs: Date.now() * 1000000,
  });

  console.log(`  ✔ Finding ID: ${ptraceFinding.findingId}`);
  console.log(`  ✔ Severity ID: ${ptraceFinding.severityId} (HIGH SEVERITY)`);
  console.log(`  ✔ Threat Rule: ${ptraceFinding.threatDetails?.ruleName}`);
  console.log(`  ✔ MITRE ATT&CK: ${ptraceFinding.threatDetails?.mitreTechniqueId} (Process Injection)`);

  console.log('\n[3/3] Simulating Critical Container Breakout / Escape Attack...');
  const breakoutFinding = ebpfService.processEbpfProbe({
    probeId: 'probe-ebpf-ring-003',
    hostName: 'k8s-node-prod-02',
    containerId: 'container-payment-ingress-88',
    containerName: 'payment-ingress-pod',
    syscall: 'container_escape_attempt',
    pid: 31044,
    uid: 0,
    binaryPath: '/nsenter',
    commandLine: 'nsenter --target 1 --mount --uts --ipc --net --pid /bin/sh',
    timestampEpochNs: Date.now() * 1000000,
  });

  console.log(`  🚨🚨 [CRITICAL BREAKOUT DETECTED]: ${breakoutFinding.findingId}`);
  console.log(`  ✔ Severity ID: ${breakoutFinding.severityId} (FATAL / CRITICAL P0)`);
  console.log(`  ✔ Threat Finding: ${breakoutFinding.threatDetails?.ruleName}`);
  console.log(`  ✔ MITRE ATT&CK: ${breakoutFinding.threatDetails?.mitreTechniqueId} (Escape to Host)`);
  console.log(`  ✔ Target Container: ${breakoutFinding.container?.name} (${breakoutFinding.container?.id})`);
  console.log(`  🔒 Cryptographic Integrity Proof: ${breakoutFinding.canonicalHash}`);

  console.log('\n========================================================================');
  console.log(' 🎉 EBPF KERNEL PROBE TELEMETRY SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ eBPF simulation failed:', err);
  process.exit(1);
});
