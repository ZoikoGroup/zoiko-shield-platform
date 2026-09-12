import { createHash, randomUUID } from 'crypto';
import { createWorkloadToken } from '../libs/security/src/workload-token';

/**
 * ZoikoShield Residency & Evidence-Durability Smoke Test
 *
 * This replaces an earlier version of this script that printed a scripted
 * "regional-cell standby failover" narrative (leader demotion, fencing
 * tokens, Raft quorum, RTO/RPO figures) entirely from hardcoded literals,
 * with zero network calls to any running service. Every number in that
 * version was fabricated - it always printed PASS regardless of whether
 * anything was actually running.
 *
 * There is no multi-region cell topology in this deployment today
 * (docker-compose.yml runs one Postgres instance and one copy of each
 * service; no leader election, no cross-region replication). So rather
 * than simulate a capability that doesn't exist, this script makes real
 * HTTP calls against the live stack and checks the two durability/
 * isolation primitives that DO exist and that a regional-failover
 * rehearsal would actually depend on:
 *
 *   1. Tenant data-residency enforcement (shield-ingest refuses to create
 *      a connector whose sourceRegion doesn't match the tenant's committed
 *      dataResidencyRegion - the mechanism that would stop a cell from
 *      accepting out-of-region writes in the first place).
 *   2. Evidence Merkle-anchoring integrity, including tamper detection
 *      (shield-anchor's inclusion-proof verification actually rejects a
 *      mutated proof rather than always returning true) - the mechanism
 *      an RPO=0 claim after a failover would rely on.
 *
 * Cross-region leader promotion, fencing, and RTO/RPO are explicitly
 * reported as NOT IMPLEMENTED below rather than faked.
 */

const SHIELD_INGEST_URL =
  process.env.SHIELD_INGEST_URL || 'http://localhost:3002';
const SHIELD_ANCHOR_URL =
  process.env.SHIELD_ANCHOR_URL || 'http://localhost:3005';
// A real, currently-ACTIVE tenant seeded in this local stack (region: eu-west-1).
const TENANT_ID =
  process.env.SMOKE_TEST_TENANT_ID || '186ac75b-273e-41f7-8016-2f2e2d828b60';
const ENVIRONMENT_ID =
  process.env.SMOKE_TEST_ENVIRONMENT_ID ||
  'e0565b23-4bfa-4785-9020-ddbb0366293f';
const TENANT_COMMITTED_REGION = process.env.SMOKE_TEST_TENANT_REGION || 'eu-west-1';
const MISMATCHED_REGION = 'us-east-1';

interface StageResult {
  step: number;
  name: string;
  status: 'PASS' | 'FAIL' | 'NOT_IMPLEMENTED';
  details: string;
}

process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'dr-rehearsal-script';
// Must match the docker-compose fallback (`${WORKLOAD_IDENTITY_DEV_SECRET:-local-workload-identity-change-me}`)
// that shield-ingest/shield-anchor actually run with locally - backend/.env's
// WORKLOAD_IDENTITY_DEV_SECRET is a separate, currently-unused placeholder for
// host-mode (`nest start`) runs, not what the docker containers verify against.
process.env.WORKLOAD_IDENTITY_DEV_SECRET =
  process.env.WORKLOAD_IDENTITY_DEV_SECRET || 'local-workload-identity-change-me';

function workloadAuthHeader(audience: string): Record<string, string> {
  return { Authorization: `Bearer ${createWorkloadToken(audience)}` };
}

async function createConnector(sourceRegion: string) {
  const res = await fetch(`${SHIELD_INGEST_URL}/api/v1/connectors`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': TENANT_ID,
      ...workloadAuthHeader('shield-ingest'),
    },
    body: JSON.stringify({
      name: `dr-rehearsal-probe-${randomUUID().slice(0, 8)}`,
      provider: 'generic-webhook',
      environmentId: ENVIRONMENT_ID,
      sourceRegion,
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function checkResidencyEnforcement(): Promise<StageResult[]> {
  const stages: StageResult[] = [];

  console.log('[1/3] Verifying shield-ingest REJECTS an out-of-residency connector...');
  const rejected = await createConnector(MISMATCHED_REGION);
  const wasRejected = rejected.status >= 400 && rejected.status < 500;
  const mentionsResidency = JSON.stringify(rejected.body)
    .toLowerCase()
    .includes('residency');
  console.log(`  -> HTTP ${rejected.status}: ${JSON.stringify(rejected.body).slice(0, 160)}`);
  stages.push({
    step: 1,
    name: 'Reject out-of-residency connector creation',
    status: wasRejected && mentionsResidency ? 'PASS' : 'FAIL',
    details: wasRejected && mentionsResidency
      ? `Correctly rejected sourceRegion='${MISMATCHED_REGION}' against tenant committed region '${TENANT_COMMITTED_REGION}' (HTTP ${rejected.status})`
      : `Expected a 4xx residency-violation response, got HTTP ${rejected.status}: ${JSON.stringify(rejected.body)}`,
  });

  console.log("\n[2/3] Verifying shield-ingest ACCEPTS an in-residency connector...");
  const accepted = await createConnector(TENANT_COMMITTED_REGION);
  const wasAccepted = accepted.status >= 200 && accepted.status < 300;
  console.log(`  -> HTTP ${accepted.status}: ${JSON.stringify(accepted.body).slice(0, 160)}`);
  stages.push({
    step: 2,
    name: 'Accept in-residency connector creation',
    status: wasAccepted ? 'PASS' : 'FAIL',
    details: wasAccepted
      ? `Correctly accepted sourceRegion='${TENANT_COMMITTED_REGION}' matching tenant's committed region (HTTP ${accepted.status})`
      : `Expected 2xx, got HTTP ${accepted.status}: ${JSON.stringify(accepted.body)}`,
  });

  return stages;
}

async function checkEvidenceAnchoringIntegrity(): Promise<StageResult> {
  console.log('\n[3/3] Verifying evidence Merkle-anchoring integrity & tamper detection...');

  const leaves = [0, 1, 2].map((i) => ({
    evidenceId: `dr-rehearsal-evidence-${i}-${randomUUID().slice(0, 8)}`,
    tenantId: TENANT_ID,
    eventType: 'DR_REHEARSAL_PROBE',
    payloadDigest: createHash('sha256').update(`probe-payload-${i}`).digest('hex'),
    timestamp: new Date().toISOString(),
  }));

  const sealRes = await fetch(`${SHIELD_ANCHOR_URL}/api/v1/anchor/batches/seal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...workloadAuthHeader('shield-anchor'),
    },
    body: JSON.stringify({ items: leaves }),
  });
  if (!sealRes.ok) {
    const body = await sealRes.text();
    return {
      step: 3,
      name: 'Evidence Merkle-anchoring integrity',
      status: 'FAIL',
      details: `Failed to seal epoch batch: HTTP ${sealRes.status} ${body}`,
    };
  }
  const checkpoint = await sealRes.json();
  console.log(`  -> Sealed epoch #${checkpoint.epochNumber}, root ${checkpoint.merkleRoot.slice(0, 16)}...`);

  const proofRes = await fetch(
    `${SHIELD_ANCHOR_URL}/api/v1/anchor/proofs/${checkpoint.epochNumber}/0`,
    { headers: workloadAuthHeader('shield-anchor') },
  );
  if (!proofRes.ok) {
    return {
      step: 3,
      name: 'Evidence Merkle-anchoring integrity',
      status: 'FAIL',
      details: `Failed to generate inclusion proof: HTTP ${proofRes.status}`,
    };
  }
  const proof = await proofRes.json();

  const verifyGenuine = await fetch(`${SHIELD_ANCHOR_URL}/api/v1/anchor/proofs/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...workloadAuthHeader('shield-anchor') },
    body: JSON.stringify(proof),
  }).then((r) => r.json());
  console.log(`  -> Genuine proof verification: valid=${verifyGenuine.valid}`);

  const tamperedProof = { ...proof, leafHash: createHash('sha256').update('tampered').digest('hex') };
  const verifyTampered = await fetch(`${SHIELD_ANCHOR_URL}/api/v1/anchor/proofs/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...workloadAuthHeader('shield-anchor') },
    body: JSON.stringify(tamperedProof),
  }).then((r) => r.json());
  console.log(`  -> Tampered proof verification: valid=${verifyTampered.valid} (expected false)`);

  const pass = verifyGenuine.valid === true && verifyTampered.valid === false;
  return {
    step: 3,
    name: 'Evidence Merkle-anchoring integrity & tamper detection',
    status: pass ? 'PASS' : 'FAIL',
    details: pass
      ? `Genuine inclusion proof verified true; a hash-tampered copy of the same proof verified false (epoch #${checkpoint.epochNumber}, ${checkpoint.leafCount} leaves)`
      : `Expected genuine=true/tampered=false, got genuine=${verifyGenuine.valid}/tampered=${verifyTampered.valid}`,
  };
}

async function run() {
  console.log('========================================================================');
  console.log(' ZoikoShield Residency & Evidence-Durability Smoke Test');
  console.log(' (NOT a cross-region failover rehearsal - see disclosure below)');
  console.log('========================================================================\n');

  const stages: StageResult[] = [];
  try {
    stages.push(...(await checkResidencyEnforcement()));
    stages.push(await checkEvidenceAnchoringIntegrity());
  } catch (err) {
    console.error('\nFatal error while contacting the live stack:', err);
    stages.push({
      step: stages.length + 1,
      name: 'Live stack reachability',
      status: 'FAIL',
      details: `Request failed: ${(err as Error).message}. Is docker compose up (shield-ingest:3002, shield-anchor:3005)?`,
    });
  }

  console.log('\n========================================================================');
  console.log(' SUMMARY');
  console.log('========================================================================');
  for (const st of stages) {
    console.log(` [${st.status}] Step ${st.step}: ${st.name.padEnd(52)} | ${st.details}`);
  }

  console.log('\n------------------------------------------------------------------------');
  console.log(' DISCLOSURE: capabilities this script does NOT test');
  console.log('------------------------------------------------------------------------');
  console.log(
    ' [NOT_IMPLEMENTED] Cross-region cell failover: no multi-region topology exists\n' +
    '                    in this deployment (single docker-compose stack, one\n' +
    '                    Postgres instance). There is no leader election, fencing,\n' +
    '                    or standby-cell promotion to rehearse, so no RTO/RPO figure\n' +
    '                    is reported. Building that topology is tracked separately.',
  );
  console.log('========================================================================\n');

  const failed = stages.some((s) => s.status === 'FAIL');
  if (failed) {
    console.error('RESULT: FAIL - one or more real checks against the live stack failed.');
    process.exit(1);
  }
  console.log('RESULT: PASS - residency enforcement and evidence-anchoring integrity both verified live.');
}

run().catch((err) => {
  console.error('Fatal smoke test error:', err);
  process.exit(1);
});
