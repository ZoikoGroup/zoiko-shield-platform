/**
 * Continuous Zero-Trust Device Health & Posture Attestation Simulator
 * 
 * Simulates:
 * 1. Health evaluation of fully compliant corporate developer laptop (TPM 2.0, BitLocker, CrowdStrike active).
 * 2. Evaluating degraded BYOD contractor device missing disk encryption (Step-Up MFA enforced).
 * 3. Detecting impossible geo-velocity travel anomaly (instant OAuth/JWT session revocation).
 */

import 'dotenv/config';
import 'reflect-metadata';
import { DevicePostureAttestationService } from '../apps/shield-core/src/modules/device-posture/device-posture-attestation.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Continuous Zero-Trust Device Posture Simulator');
  console.log('    Specification: ZS-SOAR-DISP-001 §9 (Continuous Identity & Endpoint Posture)');
  console.log('========================================================================\n');

  const postureService = new DevicePostureAttestationService();

  console.log('[1/3] Attesting Fully Hardened Enterprise Corporate Device...');
  const passReceipt = postureService.evaluateDevicePosture({
    deviceId: 'dev-corp-macbook-pro-01',
    operatorId: 'operator-lead-secops',
    tenantId: 'tenant-enterprise-01',
    hasTpm2Hardware: true,
    isDiskEncrypted: true,
    isEdrActive: true,
    isOsPatched: true,
    geoLatitude: 37.7749,
    geoLongitude: -122.4194,
  });

  console.log(`  ✔ Device ID: ${passReceipt.deviceId}`);
  console.log(`  ✔ Posture Score: ${passReceipt.postureScore}/100 [${passReceipt.trustTier}]`);
  console.log(`  ✔ Policy Enforced: ${passReceipt.actionEnforced}`);
  console.log(`  🔒 Attestation Digest: ${passReceipt.attestationDigest.slice(0, 32)}...`);

  console.log('\n[2/3] Attesting Degraded Contractor BYOD Device (Unencrypted Disk)...');
  const degradedReceipt = postureService.evaluateDevicePosture({
    deviceId: 'dev-contractor-dell-xps',
    operatorId: 'operator-contractor-ext',
    tenantId: 'tenant-enterprise-01',
    hasTpm2Hardware: true,
    isDiskEncrypted: false,
    isEdrActive: true,
    isOsPatched: true,
    geoLatitude: 51.5074,
    geoLongitude: -0.1278,
  });

  console.log(`  ⚠️ Device ID: ${degradedReceipt.deviceId}`);
  console.log(`  ⚠️ Posture Score: ${degradedReceipt.postureScore}/100 [${degradedReceipt.trustTier}]`);
  console.log(`  ⚠️ Policy Enforced: ${degradedReceipt.actionEnforced}`);

  console.log('\n[3/3] Detecting Impossible Geo-Velocity Travel Anomaly (NYC -> Tokyo in 15 mins)...');
  const anomalyReceipt = postureService.evaluateDevicePosture({
    deviceId: 'dev-stolen-token-probe',
    operatorId: 'operator-compromised-user',
    tenantId: 'tenant-enterprise-01',
    hasTpm2Hardware: true,
    isDiskEncrypted: true,
    isEdrActive: true,
    isOsPatched: true,
    geoLatitude: 35.6762, // Tokyo
    geoLongitude: 139.6503,
    lastGeoLatitude: 40.7128, // NYC
    lastGeoLongitude: -74.006,
    lastSignalEpochMs: Date.now() - 1000 * 60 * 15,
  });

  console.log(`  🚨🚨 [CRITICAL ANOMALY]: ${anomalyReceipt.deviceId}`);
  console.log(`  🚨 Posture Score: ${anomalyReceipt.postureScore}/100 [${anomalyReceipt.trustTier}]`);
  console.log(`  🚨 Action Enforced: ${anomalyReceipt.actionEnforced} (Terminating all active tokens)`);
  console.log(`  🔒 Forensic Attestation Receipt: ${anomalyReceipt.attestationDigest}`);

  console.log('\n========================================================================');
  console.log(' 🎉 DEVICE POSTURE ATTESTATION SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Device posture simulation failed:', err);
  process.exit(1);
});
