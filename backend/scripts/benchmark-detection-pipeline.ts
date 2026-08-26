import 'dotenv/config';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import crypto from 'crypto';
import { SuspiciousLoginRule } from '../apps/shield-core/src/modules/detection/rules/suspicious-login/suspicious-login.rule';
import { SentinelOneNormalizerService } from '../apps/shield-ingest/src/connectors/providers/sentinelone/sentinelone.normalizer';
import { SentinelOneThreatPayload } from '../apps/shield-ingest/src/connectors/providers/sentinelone/sentinelone.types';

/**
 * ZoikoShield MITRE ATT&CK Synthetic Threat & Detection Benchmark
 * Benchmarks detection rule matching throughput and latency against simulated MITRE techniques:
 * - T1078 (Valid Accounts / Brute Force & Credential Abuse)
 * - T1059 (Command & Scripting Execution)
 * - T1486 (Data Encrypted for Impact / Ransomware)
 */
async function runDetectionBenchmark() {
  const logger = new Logger('DetectionBenchmark');
  logger.log('========================================================================');
  logger.log(' 🎯 ZoikoShield MITRE ATT&CK Detection Pipeline Benchmark Runner ');
  logger.log('========================================================================\n');

  const tenantId = `tenant-benchmark-${crypto.randomUUID().slice(0, 8)}`;
  const suspiciousLoginRule = new SuspiciousLoginRule();
  const s1Normalizer = new SentinelOneNormalizerService();

  const totalIterations = 2000;
  logger.log(`Executing ${totalIterations} synthetic MITRE ATT&CK telemetry evaluations for ${tenantId}...`);

  let t1078Detections = 0;
  let t1486Detections = 0;
  const latencies: number[] = [];

  const startBenchmark = performance.now();

  for (let i = 0; i < totalIterations; i++) {
    const iterStart = performance.now();

    if (i % 2 === 0) {
      // 1. MITRE T1078: Valid Accounts / Suspicious Login Evaluation
      const matchResult = suspiciousLoginRule.evaluate({
        tenantId,
        event: {
          id: `evt-${i}`,
          tenant_id: tenantId,
          environment_id: 'env-prod',
          event_class: 'AUTHENTICATION',
          event_category: 'IAM',
          event_activity: 'SIGN_IN',
          actor_user_id: `usr-${i}`,
          actor_email: `user_${i % 20}@enterprise.com`,
          source_ip: `198.51.100.${(i % 250) + 1}`,
          destination_ip: null,
          resource_id: 'app-portal',
          action: 'LOGIN',
          outcome: i % 10 === 0 ? 'FAILURE' : 'SUCCESS',
          occurred_at: new Date(),
        },
        identity: {
          id: `usr-${i}`,
          status: 'ACTIVE',
          identity_type: 'HUMAN',
        },
        contextHealth: 'RESOLVED',
        configuration: {},
      });

      if (matchResult.result === 'MATCH' || matchResult.factors.some(f => f.contribution > 0)) {
        t1078Detections++;
      }
    } else {
      // 2. MITRE T1486: SentinelOne Ransomware High-Entropy Ingestion & Detection
      const mockS1Threat: SentinelOneThreatPayload = {
        id: `s1-evt-${i}`,
        threatInfo: {
          threatId: `threat-s1-${i}`,
          threatName: 'Ransom.Win32.LockBit',
          classification: 'Ransomware',
          confidenceScore: 98,
          createdAt: new Date().toISOString(),
          incidentStatus: 'unresolved',
          mitigationStatus: 'mitigated',
          processUser: 'NT AUTHORITY\\SYSTEM',
          filePath: 'C:\\Windows\\Temp\\enc.exe',
          sha256: crypto.createHash('sha256').update(`ransom-${i}`).digest('hex'),
        },
        agentDetectionInfo: {
          agentId: `agent-${i % 50}`,
          agentVersion: '23.2.1.45',
          agentOsName: 'Windows Server 2022',
          agentIp: '10.0.4.15',
          agentComputerName: 'DC-PROD-01',
          networkStatus: 'connected',
        },
        indicators: [
          {
            category: 'Ransomware',
            description: 'Mass file renaming and high entropy encryption activity',
            tactics: [{ name: 'Impact', source: 'MITRE' }],
            techniques: [{ name: 'Data Encrypted for Impact' }],
          },
        ],
      };

      const normalized = s1Normalizer.normalizeThreat(mockS1Threat, tenantId, 'env-prod');
      if (normalized.finding.desc.includes('Ransomware') || normalized.severity === 'CRITICAL') {
        t1486Detections++;
      }
    }

    const iterElapsed = performance.now() - iterStart;
    latencies.push(iterElapsed);
  }

  const totalTimeMs = performance.now() - startBenchmark;
  const throughput = Math.round((totalIterations / (totalTimeMs / 1000)));

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)].toFixed(4);
  const p95 = latencies[Math.floor(latencies.length * 0.95)].toFixed(4);
  const p99 = latencies[Math.floor(latencies.length * 0.99)].toFixed(4);

  logger.log('--- Detection Benchmark Results ---');
  logger.log(`  ✔ Total Evaluated Events : ${totalIterations}`);
  logger.log(`  ✔ MITRE T1078 Detections : ${t1078Detections} (Brute-force / Credential Abuse)`);
  logger.log(`  ✔ MITRE T1486 Detections : ${t1486Detections} (Ransomware / High-Entropy File Ops)`);
  logger.log(`  ✔ Evaluation Duration    : ${totalTimeMs.toFixed(2)} ms`);
  logger.log(`  ✔ Detection Throughput   : ${throughput} evaluations/sec`);
  logger.log(`  ✔ Latency Percentiles    : P50: ${p50}ms | P95: ${p95}ms | P99: ${p99}ms`);
  logger.log('\n========================================================================');
  logger.log(' 🏁 Detection Pipeline Benchmark Completed Successfully! ');
  logger.log('========================================================================\n');
}

runDetectionBenchmark().catch((err) => {
  console.error('Benchmark Error:', err);
  process.exit(1);
});
