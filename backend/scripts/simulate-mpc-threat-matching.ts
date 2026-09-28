/**
 * Real Private Set Intersection (PSI) Threat Intel Matcher Simulator
 *
 * Simulates (RFC 9497 OPRF, real ECDH-based PSI — not an HMAC hash the
 * server could trivially recompute):
 * 1. Tenant blinding internal suspicious IPs and IOCs locally (TenantPsiClient) —
 *    the blind scalar never leaves the tenant side.
 * 2. The server (MpcThreatMatcherService) evaluating only opaque blinded curve
 *    points — it never receives a raw indicator or blinding secret.
 * 3. The tenant finalizing and computing the intersection locally, detecting
 *    exact matches (APT29 C2, DarkSide) without the feed provider ever
 *    learning which indicators were queried, matching or not.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import {
  MpcThreatMatcherService,
  TenantPsiClient,
} from '../apps/shield-ingest/src/mpc-intel/mpc-threat-matcher.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Private Set Intersection (PSI) Threat Intel Matcher Simulator');
  console.log('    Specification: ZS-SOC-FEED-001 §10 (Privacy-Preserving Threat Intelligence)');
  console.log('========================================================================\n');

  const mpcService = new MpcThreatMatcherService();
  const tenantId = `tenant-${crypto.randomUUID().slice(0, 8)}`;

  console.log('[1/4] Tenant Blinding Internal Threat Queries Locally (server never sees this step)...');
  const suspiciousInternalIndicators = [
    { raw: '198.51.100.99', label: 'Suspicious External Ingress' },
    { raw: '8.8.8.8', label: 'Standard Google Public DNS' },
    { raw: '1.1.1.1', label: 'Standard Cloudflare DNS' },
    { raw: 'malware-c2-drop.attacker.org', label: 'Unknown Outbound DNS Query' },
  ];
  const blinded = TenantPsiClient.blindIndicators(
    suspiciousInternalIndicators.map((i) => i.raw),
  );
  blinded.forEach((b, i) => {
    console.log(`  🔒 Blinded Query: "${suspiciousInternalIndicators[i].label}" ──> ${b.blindedQuery.blindedIndicatorHash.slice(0, 24)}... (server cannot recover the raw indicator from this)`);
  });

  console.log('\n[2/4] Server Evaluating Blinded Queries (receives only opaque curve points)...');
  const evaluationResults = mpcService.evaluateBlindedQueries(
    blinded.map((b) => b.blindedQuery),
  );
  console.log(`  ✔ Server evaluated ${evaluationResults.length} blinded queries without ever seeing a raw indicator or the tenant's blind.`);

  console.log('\n[3/4] Tenant Finalizing and Computing the Intersection Locally...');
  const serverDataset = mpcService.getSafeToRevealDataset();
  const matchResult = TenantPsiClient.finalizeAndIntersect(
    tenantId,
    blinded,
    evaluationResults,
    serverDataset,
  );
  console.log(`  ✔ PSI Receipt ID: ${matchResult.receiptId}`);
  console.log(`  ✔ Total Queries Evaluated: ${matchResult.totalQueriedCount}`);
  console.log(`  ✔ Intersecting Matches Found: ${matchResult.matchedIndicatorsCount}`);

  console.log('\n[4/4] Inspecting Match Findings (computed entirely tenant-side):');
  for (const match of matchResult.matches) {
    console.log(`  🚨 [THREAT INTEL HIT] Type: ${match.iocType} | Campaign: ${match.threatActorCampaign} | Confidence: ${(match.threatConfidence * 100).toFixed(0)}%`);
  }
  console.log(`\n  🔒 MPC Attestation Digest: ${matchResult.attestationDigest}`);
  console.log('  🔒 Privacy Guarantee: The server never learned which of the 4 indicators were queried, let alone which matched — that determination happened only on the tenant side.');

  console.log('\n========================================================================');
  console.log(' 🎉 PSI THREAT INTEL MATCHING SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ PSI threat simulation failed:', err);
  process.exit(1);
});
