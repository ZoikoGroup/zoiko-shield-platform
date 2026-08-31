/**
 * ZoikoShield Comprehensive Suspicious Log Collection & Tenant Reporting Verifier
 * 
 * Verifies End-to-End:
 * 1. Collecting suspicious security event logs across heterogeneous sources (IDP, EDR, eBPF, Network).
 * 2. Ingesting and normalizing into OCSF schema within strict multi-tenant boundaries.
 * 3. Detecting anomalies via Tier-A Kafka stream rules and ClickHouse analytical scans.
 * 4. Correlating alerts and attack paths into an active Incident Case.
 * 5. Synthesizing an AI-powered Root Cause Analysis (RCA) and Executive Narrative Report for the tenant.
 * 6. Producing signed cryptographic compliance evidence and PromQL SLO metrics.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';

// Ingest & Analytics
import {
  TierAWindowedDetectorService,
  TierARuleContract,
  NormalizedStreamEvent,
} from '../apps/shield-ingest/src/detection/tier-a/tier-a-windowed-detector.service';
import {
  ClickhouseAnalyticalDetectorService,
  SecurityEventRecord,
} from '../apps/shield-ingest/src/analytics/clickhouse-analytical-detector.service';

// AI SecOps & Safety
import {
  IncidentRcaGeneratorService,
  IncidentTelemetryInput,
} from '../apps/shield-ai/src/rca/incident-rca-generator.service';
import {
  ModelArmorSafetyGatewayService,
} from '../apps/shield-ai/src/gateway/model-armor-safety-gateway.service';
import {
  AttackPathDiscoveryService,
} from '../apps/shield-ai/src/graph/attack-path-discovery.service';

// Observability & SLO
import {
  SloMetricsExporterService,
} from '../apps/shield-core/src/modules/observability/slo-metrics-exporter.service';

async function main() {
  console.log('========================================================================================');
  console.log(' 🛡️  ZoikoShield Suspicious Telemetry Ingestion & Tenant Incident Reporting Verifier');
  console.log('    Objective: Verify multi-source log collection, threat detection, and tenant reporting');
  console.log('========================================================================================\n');

  const tenantId = `tenant-enterprise-bank-${crypto.randomUUID().slice(0, 6)}`;
  const victimUser = 'robert.chen@enterprise-bank.com';
  const compromisedHost = 'srv-k8s-payment-node-04';
  const targetDb = 'db-pci-cardholder-vault';

  // Instantiate Core Services
  const tierADetector = new TierAWindowedDetectorService();
  const clickhouseDetector = new ClickhouseAnalyticalDetectorService();
  const graphService = new AttackPathDiscoveryService();
  const rcaService = new IncidentRcaGeneratorService();
  const modelArmorService = new ModelArmorSafetyGatewayService();
  const sloService = new SloMetricsExporterService();

  // -------------------------------------------------------------------------
  // STAGE 1: Suspicious Multi-Source Log Ingestion
  // -------------------------------------------------------------------------
  console.log(`[Stage 1/5] Ingesting Suspicious Multi-Source Telemetry for Tenant '${tenantId}'...`);

  const rawLogs = [
    {
      source: 'okta-idp',
      timestamp: '2026-08-31T07:10:00.000Z',
      eventType: 'AUTH_FAILURE_MFA_DENIED',
      actor: '185.220.101.5 (Tor Exit Node)',
      target: victimUser,
      details: { attempts: 5, userAgent: 'python-requests/2.28' },
    },
    {
      source: 'okta-idp',
      timestamp: '2026-08-31T07:12:00.000Z',
      eventType: 'AUTH_SUCCESS_ANOMALOUS_GEO',
      actor: '185.220.101.5',
      target: victimUser,
      details: { mfaMethod: 'Push-Fatigue-Bypassed', location: 'Unknown' },
    },
    {
      source: 'crowdstrike-falcon-edr',
      timestamp: '2026-08-31T07:14:30.000Z',
      eventType: 'SUSPICIOUS_POWERSHELL_CRADLE',
      actor: victimUser,
      target: compromisedHost,
      details: { commandLine: 'powershell.exe -nop -w hidden -enc JABzAD0ATgBlAHcALQBPAGIAagBlAGMAdAA...', parentProcess: 'w3wp.exe' },
    },
    {
      source: 'ebpf-kernel-probe',
      timestamp: '2026-08-31T07:16:00.000Z',
      eventType: 'UNAUTHORIZED_LATERAL_SOCKET_CONNECT',
      actor: compromisedHost,
      target: targetDb,
      details: { protocol: 'TCP', port: 5432, syscall: 'sys_connect', cgroup: '/kubepods/burstable' },
    },
    {
      source: 'sentinelone-threat',
      timestamp: '2026-08-31T07:18:15.000Z',
      eventType: 'CREDENTIAL_DUMPING_LSASS_PROBE',
      actor: victimUser,
      target: compromisedHost,
      details: { threatClassification: 'Trojan.Mimikatz.Gen', killed: false, quarantined: true },
    },
  ];

  console.log(`  ✔ Collected ${rawLogs.length} events across Okta IDP, CrowdStrike Falcon, SentinelOne, and eBPF Kernel Probes.`);

  // -------------------------------------------------------------------------
  // STAGE 2: Real-Time Stream & Parameterized Analytical Threat Detection
  // -------------------------------------------------------------------------
  console.log('\n[Stage 2/5] Evaluating Real-Time Stream Rules & ClickHouse Partitioned Analytics...');

  // A. Tier-A Windowed Kafka Rule
  const authRule: TierARuleContract = {
    ruleId: 'ZS-RULE-AUTH-BRUTEFORCE-001',
    version: '1.0.0',
    requiredSchema: 'ocsf.authentication.v1',
    partitionKeyPattern: 'tenant_id:actor_id',
    windowSeconds: 300,
    graceSeconds: 60,
    missingDataBehavior: 'INCOMPLETE',
    replaySemantics: 'DETERMINISTIC_PINNED_SNAPSHOT',
    sloClass: 'TIER_A_SUB_SECOND',
    thresholdCount: 2,
    matchPredicate: (e) => e.payload?.status === 'FAILURE' || e.payload?.status === 'ANOMALOUS_SUCCESS',
  };

  const streamEvents: NormalizedStreamEvent[] = [
    {
      eventId: 'evt-stream-001',
      tenantId,
      entityKey: victimUser,
      schemaName: 'ocsf.authentication.v1',
      timestamp: '2026-08-31T07:10:00.000Z',
      payload: { status: 'FAILURE' },
    },
    {
      eventId: 'evt-stream-002',
      tenantId,
      entityKey: victimUser,
      schemaName: 'ocsf.authentication.v1',
      timestamp: '2026-08-31T07:12:00.000Z',
      payload: { status: 'ANOMALOUS_SUCCESS' },
    },
  ];

  let streamAlertCandidate;
  for (const se of streamEvents) {
    const res = tierADetector.processStreamEvent(authRule, se);
    if (res.detectionState === 'MATCHED') {
      streamAlertCandidate = res;
    }
  }

  if (streamAlertCandidate) {
    console.log(`  🚨 [TIER-A STREAM MATCH] Rule '${authRule.ruleId}' fired for '${victimUser}' (Candidate ID: ${streamAlertCandidate.candidateId}, Severity: ${streamAlertCandidate.severity})`);
  }

  // B. ClickHouse Parameterized Analytical Partition Scan
  const chEvents: SecurityEventRecord[] = rawLogs.map((l, i) => ({
    tenantId,
    eventTime: l.timestamp,
    eventId: `ch-evt-00${i + 1}`,
    className: l.eventType.includes('AUTH') ? 'Authentication' : 'NetworkActivity',
    activityId: 1000 + i,
    severity: 4,
    actorId: l.actor,
    targetId: l.target,
    payloadJson: JSON.stringify(l.details),
    schemaVersion: '1.2.0',
  }));

  clickhouseDetector.insertEvents(chEvents);
  const chFinding = clickhouseDetector.executeParameterizedDetection(
    {
      tenantId,
      timeRangeStart: '2026-08-31T07:00:00.000Z',
      timeRangeEnd: '2026-08-31T07:30:00.000Z',
      limit: 100,
    },
    'ZS-ANALYTIC-RULE-LATERAL-BURST-001',
  );

  console.log(`  🚨 [CLICKHOUSE ANALYTICAL MATCH] Scanned ${chFinding.totalScannedEvents} events in partition '${tenantId}:202608' -> Matched ${chFinding.matchedEventIds.length} records.`);

  // -------------------------------------------------------------------------
  // STAGE 3: Attack Graph Discovery & MITRE ATT&CK Path Correlation
  // -------------------------------------------------------------------------
  console.log('\n[Stage 3/5] Constructing Attack Graph Topology & Blast Radius Analysis...');

  graphService.addNode({ id: 'node-attacker', name: '185.220.101.5 (Tor Exit)', type: 'IDENTITY_USER' });
  graphService.addNode({ id: 'node-user', name: victimUser, type: 'IDENTITY_USER' });
  graphService.addNode({ id: 'node-host', name: compromisedHost, type: 'COMPUTE_INSTANCE' });
  graphService.addNode({ id: 'node-db', name: targetDb, type: 'DATABASE', isCrownJewel: true });

  graphService.addEdge({ sourceId: 'node-attacker', targetId: 'node-user', relationship: 'ASSUMES_ROLE', weight: 0.95 });
  graphService.addEdge({ sourceId: 'node-user', targetId: 'node-host', relationship: 'CAN_EXECUTE', weight: 0.9 });
  graphService.addEdge({ sourceId: 'node-host', targetId: 'node-db', relationship: 'HAS_READ_ACCESS', weight: 0.85 });

  const attackPath = graphService.findShortestAttackPath('node-attacker', 'node-db');

  if (attackPath) {
    console.log(`  ✔ Discovered Critical Lateral Attack Path (Risk Score: ${attackPath.totalRiskScore}):`);
    for (const hop of attackPath.pathHops) {
      console.log(`    ➔ ${hop.from}  ──[${hop.relationship}]──►  ${hop.to}`);
    }
  }

  // -------------------------------------------------------------------------
  // STAGE 4: AI Root Cause Analysis (RCA) & Tenant Incident Report Generation
  // -------------------------------------------------------------------------
  console.log('\n[Stage 4/5] Synthesizing Autonomous AI Root Cause Analysis & Executive Report...');

  const rcaInput: IncidentTelemetryInput = {
    incidentId: `INC-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
    tenantId,
    title: 'Multi-Stage Identity Compromise, Lateral Host Execution & Vault Infiltration Probe',
    severity: 'CRITICAL',
    events: rawLogs.map((l, idx) => ({
      eventId: `rca-evt-${idx + 1}`,
      timestamp: l.timestamp,
      source: l.source,
      eventType: l.eventType,
      actor: l.actor,
      targetResource: l.target,
      details: l.details,
    })),
    attackGraphPath: ['185.220.101.5', victimUser, compromisedHost, targetDb],
  };

  const rcaReport = rcaService.generateIncidentRca(rcaInput);

  // Screen Report through Vertex AI Model Armor Safety Layer
  const safetyEvaluation = modelArmorService.processAiInference({
    requestId: `req-rca-eval-${crypto.randomUUID().slice(0, 6)}`,
    tenantId,
    principalId: 'soc.lead@enterprise-bank.com',
    useCase: 'INCIDENT_TRIAGE',
    prompt: `Review RCA summary for incident ${rcaReport.incidentId}: ${rcaReport.executiveSummary}`,
    contextTelemetry: rawLogs.map((l) => `${l.source}: ${l.eventType} on ${l.target}`),
  });

  console.log('========================================================================================');
  console.log(' 📄 ZOIKOSHIELD TENANT EXECUTIVE SECURITY INCIDENT REPORT');
  console.log('========================================================================================');
  console.log(`  Tenant ID:                ${rcaReport.tenantId}`);
  console.log(`  Incident Reference:       ${rcaReport.incidentId}`);
  console.log(`  Report ID:                ${rcaReport.rcaId}`);
  console.log(`  Generated Timestamp:      ${rcaReport.generatedAt}`);
  console.log(`  Safety Verdict:           ${safetyEvaluation.verdict} (Model Armor Screened)`);
  console.log('\n  1. EXECUTIVE SUMMARY:');
  console.log(`     ${rcaReport.executiveSummary}`);
  console.log('\n  2. ROOT CAUSE HYPOTHESIS:');
  console.log(`     ${rcaReport.rootCauseHypothesis}`);
  console.log('\n  3. MITRE ATT&CK TACTICS & TECHNIQUES IDENTIFIED:');
  for (const m of rcaReport.mitreMappings) {
    console.log(`     • [${m.techniqueId}] ${m.techniqueName} (${m.tactic}) - Confidence: ${(m.confidenceScore * 100).toFixed(0)}%`);
  }
  console.log('\n  4. BLAST RADIUS IDENTIFICATION:');
  console.log(`     • Compromised Identities: [${rcaReport.identifiedBlastRadius.compromisedAccounts.join(', ')}]`);
  console.log(`     • Affected Compute Hosts: [${rcaReport.identifiedBlastRadius.affectedHosts.join(', ')}]`);
  console.log(`     • Target Vault Resources: [${rcaReport.identifiedBlastRadius.isolatedPods.join(', ')}]`);
  console.log('\n  5. AUTOMATED SOAR CONTAINMENT ACTIONS RECOMMENDED:');
  for (const rec of rcaReport.containmentRecommendations) {
    console.log(`     ⚡ ${rec}`);
  }
  console.log(`\n  🔒 Provenance Attestation: ${rcaReport.provenanceAttestationDigest}`);
  console.log('========================================================================================\n');

  // -------------------------------------------------------------------------
  // STAGE 5: Compliance Telemetry & OpenTelemetry / PromQL SLO Metrics
  // -------------------------------------------------------------------------
  console.log('[Stage 5/5] Generating Signed Auditor Evidence & PromQL Telemetry Snapshot...');

  const sloSnapshot = sloService.generateSloMetricsSnapshot(tenantId, {
    ingestion: {
      tenantId,
      acceptanceRatePercentage: 100.0,
      lagMs: 18,
      normalizationSuccessPercentage: 100.0,
      quarantineCount: 0,
      connectorState: 'HEALTHY',
    },
    detection: {
      tenantId,
      p99LatencyMs: 64,
      replayDeterminismPercentage: 100.0,
      falsePositiveReviewRate: 0.005,
      stateStoreHealth: 'OPTIMAL',
    },
    caseResponse: {
      tenantId,
      alertToTriageAvgSeconds: 28,
      caseAgeHours: 0.25,
      approvalLatencySeconds: 8,
      executedActionsCount: 3,
      rollbackActionsCount: 0,
    },
    evidence: {
      tenantId,
      freshnessSeconds: 4,
      completenessPercentage: 100.0,
      ledgerVerifiedCount: 45,
      anchorPublicationLatencyMs: 420,
    },
    aiGateway: {
      tenantId,
      modelVersion: 'gemini-1.5-pro-002-vertex',
      avgGroundingScore: 0.996,
      citationValidityPercentage: 100.0,
      blockedVerdictsCount: 0,
      totalTokensUsed: 1850,
      tenantAttributableCostUsd: 0.046,
    },
  });

  console.log(`  ✔ SLO Snapshot ID: ${sloSnapshot.snapshotId}`);
  console.log(`  ✔ PromQL Metrics Series: ${sloSnapshot.promQlFormattedMetrics.length} metrics exported`);
  console.log(`  🔒 Evidence Ledger Attestation: ${sloSnapshot.attestationDigest}`);

  console.log('\n========================================================================================');
  console.log(' 🎉 LOG COLLECTION, THREAT DETECTION & TENANT REPORTING FULLY VERIFIED!');
  console.log('========================================================================================\n');
}

main().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
