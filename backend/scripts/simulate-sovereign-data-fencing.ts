/**
 * Sovereign Jurisdiction Residency & Cross-Border Data Fencing Simulator
 * 
 * Simulates:
 * 1. Compliant sovereign data persistence in Frankfurt (europe-west3) for EU-DORA / GDPR financial tenants.
 * 2. Real-time blocking of illegal cross-border egress attempts to non-sovereign US regions.
 * 3. Generation of cryptographic residency audit attestations.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { DataSovereigntyGuardService } from '../apps/shield-core/src/modules/legal-entity/data-sovereignty-guard.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Sovereign Data Residency & Fencing Guard Simulator');
  console.log('    Specification: ZS-T0-BE-ARCH-001 §3 (Data Sovereignty & Jurisdictions)');
  console.log('========================================================================\n');

  const sovereigntyGuard = new DataSovereigntyGuardService();
  const euTenantId = `tenant-eu-fintech-${crypto.randomUUID().slice(0, 8)}`;
  const ukTenantId = `tenant-uk-bank-${crypto.randomUUID().slice(0, 8)}`;

  console.log('[1/3] Testing EU Sovereign Data Ingest & Evidence Persistence...');
  const euDecision = sovereigntyGuard.assertSovereignRouting({
    tenantId: euTenantId,
    sourceRegion: 'europe-west1', // Belgium
    targetStorageRegion: 'europe-west3', // Frankfurt, Germany
    dataType: 'EVIDENCE_BLOB',
    jurisdiction: 'EU_SOVEREIGN',
  });
  console.log(`  ✔ Assessment ID: ${euDecision.assessmentId}`);
  console.log(`  ✔ Jurisdiction: ${euDecision.jurisdiction}`);
  console.log(`  ✔ Status: ${euDecision.status} (Ingest Authorized)`);
  console.log(`  ✔ Detail: ${euDecision.reason}`);
  console.log(`  🔒 Audit Attestation: ${euDecision.auditAttestationDigest.slice(0, 32)}...`);

  console.log('\n[2/3] Simulating Prohibited Cross-Border Egress (EU -> US Central)...');
  try {
    sovereigntyGuard.assertSovereignRouting({
      tenantId: euTenantId,
      sourceRegion: 'europe-west3',
      targetStorageRegion: 'us-central1', // Prohibited US Egress
      dataType: 'RAW_TELEMETRY',
      jurisdiction: 'EU_SOVEREIGN',
    });
  } catch (err: any) {
    console.log(`  ❌ [BLOCKED BY SOVEREIGNTY FENCE]: ${err.message}`);
  }

  console.log('\n[3/3] Testing UK Sovereign Bank Data Residency (London Only)...');
  const ukDecision = sovereigntyGuard.assertSovereignRouting({
    tenantId: ukTenantId,
    sourceRegion: 'europe-west2', // London
    targetStorageRegion: 'europe-west2', // London
    dataType: 'AUDIT_PACKAGE',
    jurisdiction: 'UK_SOVEREIGN',
  });
  console.log(`  ✔ Jurisdiction: ${ukDecision.jurisdiction}`);
  console.log(`  ✔ Status: ${ukDecision.status} in Region: europe-west2`);
  console.log(`  ✔ Detail: ${ukDecision.reason}`);

  console.log('\n========================================================================');
  console.log(' 🎉 SOVEREIGN DATA RESIDENCY & FENCING SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Sovereignty simulation failed:', err);
  process.exit(1);
});
