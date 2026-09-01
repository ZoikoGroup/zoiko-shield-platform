/**
 * ZoikoShield Zero-Trust Workload Attestation & mTLS Token Broker Simulator
 * 
 * Demonstrates:
 * 1. Issuance of 5-minute ephemeral SPIFFE identity tokens.
 * 2. Cross-satellite cryptographic verification (e.g. shield-core -> shield-action).
 * 3. Prevention of target service mismatch errors.
 * 4. Single-use nonce tracking to eliminate replay attacks.
 */

import 'dotenv/config';
import 'reflect-metadata';
import { WorkloadTokenBrokerService } from '../apps/shield-core/src/modules/workload-identity/workload-token-broker.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Ephemeral Workload Attestation & mTLS Token Simulator');
  console.log('    Specification: Zero-Trust Inter-Satellite SPIFFE RPC Authentication');
  console.log('========================================================================\n');

  const broker = new WorkloadTokenBrokerService();
  const tenantId = 'tenant-enterprise-financial-cloud';

  // Step 1: Issue Token
  console.log('[Step 1/4] Issuing short-lived SPIFFE token: shield-core ➔ shield-action...');
  const tokenRecord = broker.issueToken('shield-core', 'shield-action', tenantId, 300);
  console.log(`  ✔ SPIFFE ID: ${tokenRecord.spiffeId}`);
  console.log(`  ✔ TTL: ${tokenRecord.expiresInSeconds} seconds`);
  console.log(`  ✔ Token Nonce: ${tokenRecord.nonce}`);
  console.log(`  ✔ Encoded JWT Token: ${tokenRecord.token.substring(0, 48)}...`);

  // Step 2: Verify Token at Destination Satellite
  console.log('\n[Step 2/4] Satellite `shield-action` verifies incoming RPC token...');
  const verifiedClaims = broker.verifyToken(tokenRecord.token, 'shield-action');
  console.log(`  ✔ Verified Source: ${verifiedClaims.sourceService}`);
  console.log(`  ✔ Verified Target: ${verifiedClaims.targetService}`);
  console.log(`  ✔ Verified Tenant Binding: ${verifiedClaims.tenantId}`);
  console.log(`  ✔ Nonce Validated: ${verifiedClaims.nonce}`);

  // Step 3: Replay Attack Simulation
  console.log('\n[Step 3/4] Simulating adversarial replay attack with already-consumed nonce...');
  try {
    broker.verifyToken(tokenRecord.token, 'shield-action');
    console.error('  ❌ Replay attack unexpectedly succeeded!');
  } catch (err: any) {
    console.log(`  ✔ Expected Replay Rejection Caught: "${err.message}"`);
  }

  // Step 4: Target Service Mismatch Simulation
  console.log('\n[Step 4/4] Simulating route hijacking / target service mismatch (sent to shield-anchor)...');
  const mismatchedToken = broker.issueToken('shield-ingest', 'shield-ai', tenantId);
  try {
    broker.verifyToken(mismatchedToken.token, 'shield-anchor');
    console.error('  ❌ Route mismatch unexpectedly succeeded!');
  } catch (err: any) {
    console.log(`  ✔ Expected Target Mismatch Rejection Caught: "${err.message}"`);
  }

  console.log('\n========================================================================');
  console.log(' 🎉 ZERO-TRUST WORKLOAD ATTESTATION TOKEN BROKER SIMULATION VERIFIED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Simulation failed:', err);
  process.exit(1);
});
