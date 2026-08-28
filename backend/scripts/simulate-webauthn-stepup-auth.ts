/**
 * Zero-Trust WebAuthn / FIDO2 Hardware Key Step-Up Guard Simulator
 * 
 * Simulates:
 * 1. Issuance of ephemeral FIDO2 cryptographic challenge for Tier-1 destructive SOAR action.
 * 2. Hardware security key (e.g. YubiKey 5 FIPS) assertion with User Presence (UP) & User Verification (UV).
 * 3. Step-up authorization grant issuance unlocking autonomous containment execution.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { Fido2StepupGuardService } from '../apps/shield-action/src/auth/fido2-stepup-guard.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield WebAuthn / FIDO2 Step-Up Hardware Auth Simulator');
  console.log('    Specification: ZS-T0-BE-ARCH-001 §8 & ZS-SOAR-DISP-001 §4');
  console.log('========================================================================\n');

  const fido2Guard = new Fido2StepupGuardService();
  const tenantId = `tenant-${crypto.randomUUID().slice(0, 8)}`;
  const proposalId = `prop-critical-${crypto.randomUUID().slice(0, 8)}`;

  // Generate simulated analyst YubiKey hardware token keypair
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  console.log('[1/3] Intercepting Tier-1 Destructive SOAR Action Proposal...');
  console.log(`  ➔ Proposal ID: ${proposalId}`);
  console.log(`  ➔ Action Type: ISOLATE_ENTIRE_VPC`);
  console.log(`  ➔ Target: vpc-prod-enterprise-primary (AWS us-east-1)`);
  console.log(`  🔒 Requirement: Hardware WebAuthn / FIDO2 Step-Up Authentication Required`);

  console.log('\n[2/3] Generating Ephemeral WebAuthn Challenge...');
  const challengeSession = fido2Guard.issueChallenge({
    tenantId,
    analystId: 'ciso-soc-lead@enterprise.com',
    proposalId,
    actionType: 'ISOLATE_ENTIRE_VPC',
    targetResource: 'vpc-prod-enterprise-primary',
  });

  console.log(`  ✔ Challenge ID: ${challengeSession.challengeId}`);
  console.log(`  ✔ Challenge Nonce: ${challengeSession.challengeBase64}`);
  console.log(`  ✔ Challenge Expires At: ${new Date(challengeSession.expiresAt).toISOString()}`);

  console.log('\n[3/3] Simulating Hardware Security Key User Touch & Assertion...');
  const clientDataObj = {
    type: 'webauthn.get',
    challenge: challengeSession.challengeBase64,
    origin: 'https://security.zoikoshield.corp',
  };
  const clientDataJsonBase64 = Buffer.from(JSON.stringify(clientDataObj)).toString('base64');
  const clientDataHash = crypto.createHash('sha256').update(Buffer.from(clientDataJsonBase64, 'base64')).digest();

  // Authenticator data with UP (0x01) + UV (0x04) = 0x05
  const authDataBuf = Buffer.concat([
    crypto.randomBytes(32), // RP ID Hash
    Buffer.from([0x05]), // User Presence + User Verification
    Buffer.from([0, 0, 0, 1]), // Sign counter
  ]);
  const authenticatorDataBase64 = authDataBuf.toString('base64');

  // Sign (authData || clientDataHash) with hardware private key
  const signer = crypto.createSign('SHA256');
  signer.update(Buffer.concat([authDataBuf, clientDataHash]));
  signer.end();
  const signatureHex = signer.sign(privateKey).toString('hex');

  const grant = fido2Guard.verifyAssertionAndGrant({
    challengeId: challengeSession.challengeId,
    credentialId: 'yubikey-fips-5c-nfc-token-01',
    authenticatorDataBase64,
    clientDataJsonBase64,
    signatureHex,
    publicKeyPem,
  });

  console.log(`  ✔ Step-Up Grant Issued: ${grant.grantId}`);
  console.log(`  ✔ Hardware Attested: ${grant.fido2Verified}`);
  console.log(`  ✔ User Presence (Physical Touch): ${grant.userPresenceVerified}`);
  console.log(`  ✔ User Verification (Biometric / PIN): ${grant.userVerificationVerified}`);
  console.log(`  ✔ Grant Valid Until: ${grant.expiresAt}`);
  console.log(`  🔒 Step-Up Attestation Digest: ${grant.stepUpAttestationDigest}`);

  console.log('\n========================================================================');
  console.log(' 🎉 WEBAUTHN / FIDO2 STEP-UP AUTH SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ FIDO2 Step-Up simulation failed:', err);
  process.exit(1);
});
