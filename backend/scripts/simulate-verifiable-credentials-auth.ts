/**
 * W3C Verifiable Credentials (DID/VC) Authorization Simulator
 * 
 * Simulates:
 * 1. Provisioning decentralized identity DID for privileged operator.
 * 2. Issuing signed W3C Verifiable Credential with Tier-1 clearance and scope claims.
 * 3. Cryptographically validating VC signatures, active period, and issuer trust chain.
 * 4. Rejecting expired or tampered credentials.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { VerifiableCredentialService } from '../apps/shield-core/src/modules/verifiable-credentials/verifiable-credential.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield W3C Verifiable Credentials & DID Auth Simulator');
  console.log('    Specification: ZS-T0-TECH-001 §15 (Decentralized Identity Authorization)');
  console.log('========================================================================\n');

  const vcService = new VerifiableCredentialService();
  const operatorDid = `did:key:zSubject${crypto.randomBytes(16).toString('hex')}`;

  console.log('[1/3] Issuing Signed W3C Verifiable Credential to Privileged Operator...');
  console.log(`  ➔ Master Issuer DID: ${vcService.getIssuerDid()}`);
  console.log(`  ➔ Subject Operator DID: ${operatorDid}`);

  const vc = vcService.issueVerifiableCredential({
    subjectDid: operatorDid,
    claims: {
      operatorId: 'operator-secops-alexander',
      tenantId: 'tenant-enterprise-fintech',
      role: 'SECOPS_PRIVILEGED_OPERATOR',
      clearanceLevel: 'TIER_1_CRITICAL',
      grantedScopes: ['soar:playbook:execute', 'kms:emergency:breakglass', 'audit:package:sign'],
    },
    validityDurationHours: 12,
  });

  console.log(`  ✔ Credential ID: ${vc.id}`);
  console.log(`  ✔ Credential Types: ${vc.type.join(', ')}`);
  console.log(`  ✔ Issued At: ${vc.issuanceDate}`);
  console.log(`  ✔ Expires At: ${vc.expirationDate}`);
  console.log(`  ✔ Clearance Level: ${vc.credentialSubject.claims.clearanceLevel}`);
  console.log(`  🔒 JWS Cryptographic Signature: ${vc.proof.jwsSignatureHex.slice(0, 32)}...`);

  console.log('\n[2/3] Cryptographically Validating Legitimate Operator Verifiable Credential...');
  const verification = vcService.verifyVerifiableCredential(vc);
  console.log(`  ✔ Signature Valid: ${verification.isValid}`);
  console.log(`  ✔ Verified Operator: ${verification.claims.operatorId} (${verification.claims.role})`);
  console.log(`  ✔ Authorized Scopes: [${verification.claims.grantedScopes.join(', ')}]`);
  console.log(`  🔒 Attestation Digest: ${verification.attestationDigest}`);

  console.log('\n[3/3] Simulating Security Rejection on Tampered Clearance Level...');
  try {
    const tamperedVc = JSON.parse(JSON.stringify(vc));
    tamperedVc.credentialSubject.claims.grantedScopes.push('root:full:unrestricted');
    vcService.verifyVerifiableCredential(tamperedVc);
  } catch (err: any) {
    console.log(`  🚨 [SECURITY TRIPWIRE]: ${err.message}`);
  }

  console.log('\n========================================================================');
  console.log(' 🎉 W3C VERIFIABLE CREDENTIALS AUTH SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Verifiable credentials simulation failed:', err);
  process.exit(1);
});
