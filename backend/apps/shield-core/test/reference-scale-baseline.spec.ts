/**
 * G1-PERF-01: Reference-Scale Performance Baseline
 *
 * Validates that core platform operations meet the production SLO targets
 * defined in MASTER_BUILD_PLAN §15 and g3-ga-launch-gate-certification.md:
 *
 *   - Ingestion pipeline lag:  p99 ≤ 500 ms
 *   - Detection pipeline:      p99 ≤ 1,000 ms
 *   - Evidence freshness:      ≤ 60 s
 *   - Memory ceiling:          RSS growth < 100 MB across burst
 *
 * This spec runs entirely in-process (zero external tooling, zero new deps)
 * using Promise.all batching against the pure service layer — not over HTTP.
 * Results are written to baseline-results.json for CI artifact upload.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';

// ─── Service Under Test (pure in-process, no HTTP overhead) ──────────────────
import {
  TierAWindowedDetectorService,
  TierARuleContract,
  NormalizedStreamEvent,
} from '../../shield-ingest/src/detection/tier-a/tier-a-windowed-detector.service';
import { SentinelOneNormalizerService } from '../../shield-ingest/src/connectors/providers/sentinelone/sentinelone.normalizer';
import { SentinelOneThreatPayload } from '../../shield-ingest/src/connectors/providers/sentinelone/sentinelone.types';
import {
  BatchMerkleCheckpointerService,
  EvidenceLeaf,
} from '../../shield-anchor/src/merkle/batch-merkle-checkpointer.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function percentile(sortedMs: number[], p: number): number {
  const index = Math.ceil((p / 100) * sortedMs.length) - 1;
  return sortedMs[Math.max(0, Math.min(index, sortedMs.length - 1))];
}

async function measureParallel(
  label: string,
  count: number,
  task: (i: number) => Promise<unknown>,
): Promise<{ label: string; count: number; p50: number; p99: number; maxMs: number }> {
  const timings: number[] = [];

  const tasks = Array.from({ length: count }, (_, i) =>
    (async () => {
      const start = performance.now();
      await task(i);
      timings.push(performance.now() - start);
    })(),
  );

  await Promise.all(tasks);
  timings.sort((a, b) => a - b);

  return {
    label,
    count,
    p50: Math.round(percentile(timings, 50) * 100) / 100,
    p99: Math.round(percentile(timings, 99) * 100) / 100,
    maxMs: Math.round(timings[timings.length - 1] * 100) / 100,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('G1-PERF-01: Reference-Scale Performance Baseline', () => {
  // SLO constants (mirrored from g3-ga-launch-gate-certification.md)
  const SLO_INGEST_P99_MS = 500;
  const SLO_DETECT_P99_MS = 1000;
  const SLO_EVIDENCE_WALL_S = 60;
  const SLO_MEMORY_DELTA_MB = 100;

  const results: Record<string, unknown>[] = [];

  let normalizer: SentinelOneNormalizerService;
  let detector: TierAWindowedDetectorService;
  let merkleCheckpointer: BatchMerkleCheckpointerService;

  beforeAll(() => {
    normalizer = new SentinelOneNormalizerService();
    detector = new TierAWindowedDetectorService();
    merkleCheckpointer = new BatchMerkleCheckpointerService();
  });

  afterAll(() => {
    // Persist results for CI artifact upload
    const outputPath = join(__dirname, 'baseline-results.json');
    try {
      writeFileSync(
        outputPath,
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            slos: {
              ingestP99Ms: SLO_INGEST_P99_MS,
              detectP99Ms: SLO_DETECT_P99_MS,
              evidenceWallS: SLO_EVIDENCE_WALL_S,
              memoryDeltaMb: SLO_MEMORY_DELTA_MB,
            },
            results,
          },
          null,
          2,
        ),
      );
      console.log(`\n[PERF] Baseline results written to: ${outputPath}\n`);
    } catch {
      // ignore in test runner if write not permitted
    }
  });

  // ─── Ingestion Throughput ───────────────────────────────────────────────────

  describe('Ingestion throughput — 1,000 concurrent normalizations', () => {
    it(`p99 < ${SLO_INGEST_P99_MS} ms (production SLO)`, async () => {
      const RAW_PAYLOAD: SentinelOneThreatPayload = {
        id: 's1-perf-0',
        agentDetectionInfo: {
          agentId: 'perf-agent-1',
          agentComputerName: 'PERF-WKS-001',
          agentIp: '10.0.0.1',
          agentOsName: 'Windows 11',
          agentVersion: '22.1',
          networkStatus: 'connected',
        },
        threatInfo: {
          threatId: 'threat-perf',
          threatName: 'Perf.Test.Payload',
          classification: 'Malware',
          confidenceScore: 90,
          incidentStatus: 'unresolved',
          mitigationStatus: 'mitigated',
          createdAt: new Date().toISOString(),
          filePath: '/usr/bin/perf',
          processUser: 'perf-user',
        },
      };

      const result = await measureParallel('ingestion_normalization', 1000, async (i) => {
        const payload: SentinelOneThreatPayload = { ...RAW_PAYLOAD, id: `s1-perf-${i}` };
        normalizer.normalizeThreat(payload, 'perf-tenant', 'env-perf', 'GLOBAL');
      });

      results.push(result);
      console.log(`[INGEST] ${result.count}x: p50=${result.p50}ms  p99=${result.p99}ms  max=${result.maxMs}ms`);

      expect(result.p99).toBeLessThan(SLO_INGEST_P99_MS);
    }, 30_000);
  });

  // ─── Detection Latency ─────────────────────────────────────────────────────

  describe('Detection latency — 200 concurrent evaluations', () => {
    it(`p99 < ${SLO_DETECT_P99_MS} ms (production SLO)`, async () => {
      const rule: TierARuleContract = {
        ruleId: 'rule-perf-1',
        version: '1.0.0',
        requiredSchema: 'ocsf.authentication.v1',
        partitionKeyPattern: 'tenant_id:actor_id',
        windowSeconds: 60,
        graceSeconds: 10,
        missingDataBehavior: 'INCOMPLETE',
        replaySemantics: 'DETERMINISTIC_PINNED_SNAPSHOT',
        sloClass: 'TIER_A_SUB_SECOND',
        thresholdCount: 3,
        matchPredicate: (e) => e.schemaName === 'ocsf.authentication.v1',
      };

      const result = await measureParallel('detection_evaluation', 200, async (i) => {
        const event: NormalizedStreamEvent = {
          eventId: `evt-perf-${i}`,
          tenantId: 'perf-tenant',
          entityKey: `perf-user-${i % 10}`,
          schemaName: 'ocsf.authentication.v1',
          timestamp: new Date().toISOString(),
          payload: { severity: 5 },
        };
        detector.processStreamEvent(rule, event, false);
      });

      results.push(result);
      console.log(`[DETECT] ${result.count}x: p50=${result.p50}ms  p99=${result.p99}ms  max=${result.maxMs}ms`);

      expect(result.p99).toBeLessThan(SLO_DETECT_P99_MS);
    }, 30_000);
  });

  // ─── Evidence Freshness ────────────────────────────────────────────────────

  describe('Evidence freshness — 50 sequential Merkle checkpoints', () => {
    it(`all 50 complete within ${SLO_EVIDENCE_WALL_S}s wall clock`, async () => {
      const wallStart = Date.now();

      for (let i = 0; i < 50; i++) {
        const leaves: EvidenceLeaf[] = [
          {
            evidenceId: `rec-${i}-a`,
            tenantId: 'perf-tenant',
            eventType: 'AUTH_EVENT',
            payloadDigest: `sha256-hash-${i}-a`,
            timestamp: new Date().toISOString(),
          },
          {
            evidenceId: `rec-${i}-b`,
            tenantId: 'perf-tenant',
            eventType: 'AUTH_EVENT',
            payloadDigest: `sha256-hash-${i}-b`,
            timestamp: new Date().toISOString(),
          },
        ];
        merkleCheckpointer.buildEpochCheckpoint(leaves);
      }

      const wallMs = Date.now() - wallStart;
      const wallS = wallMs / 1000;

      results.push({
        label: 'evidence_freshness',
        count: 50,
        wallMs,
        sloSeconds: SLO_EVIDENCE_WALL_S,
      });

      console.log(`[EVID] 50 checkpoints: wall=${wallS.toFixed(2)}s  SLO=${SLO_EVIDENCE_WALL_S}s`);
      expect(wallS).toBeLessThan(SLO_EVIDENCE_WALL_S);
    }, 70_000);
  });

  // ─── Memory Ceiling ────────────────────────────────────────────────────────

  describe('Memory ceiling — burst of 500 normalizations', () => {
    it(`RSS growth < ${SLO_MEMORY_DELTA_MB} MB during burst`, async () => {
      // Force a GC cycle if available (Node.js --expose-gc flag)
      if (typeof (global as any).gc === 'function') (global as any).gc();
      const rssBefore = process.memoryUsage().rss;

      await measureParallel('memory_burst', 500, async (i) => {
        normalizer.normalizeThreat(
          {
            id: `mem-${i}`,
            agentDetectionInfo: {
              agentId: `mem-agent-${i}`,
              agentComputerName: `MEM-WKS-${i}`,
              agentIp: '10.0.0.1',
              agentOsName: 'Linux 6.1',
              agentVersion: '22.1',
              networkStatus: 'connected',
            },
            threatInfo: {
              threatId: 'mem-test',
              threatName: 'Memory.Pressure.Test',
              classification: 'Malware',
              confidenceScore: 80,
              incidentStatus: 'unresolved',
              mitigationStatus: 'mitigated',
              createdAt: new Date().toISOString(),
              filePath: '/tmp/test',
              processUser: 'perf-user',
            },
          },
          'perf-tenant',
          'env-perf',
          'GLOBAL',
        );
      });

      if (typeof (global as any).gc === 'function') (global as any).gc();
      const rssAfter = process.memoryUsage().rss;
      const deltaMb = (rssAfter - rssBefore) / (1024 * 1024);

      results.push({
        label: 'memory_ceiling',
        rssBefore: rssBefore / (1024 * 1024),
        rssAfter: rssAfter / (1024 * 1024),
        deltaMb,
        sloMb: SLO_MEMORY_DELTA_MB,
      });

      console.log(`[MEM] RSS before=${(rssBefore / 1e6).toFixed(1)}MB  after=${(rssAfter / 1e6).toFixed(1)}MB  delta=${deltaMb.toFixed(1)}MB`);
      expect(deltaMb).toBeLessThan(SLO_MEMORY_DELTA_MB);
    }, 30_000);
  });
});
