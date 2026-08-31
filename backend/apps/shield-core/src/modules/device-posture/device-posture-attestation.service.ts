import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

export interface DeviceTelemetrySignal {
  deviceId: string;
  operatorId: string;
  tenantId: string;
  hasTpm2Hardware: boolean;
  isDiskEncrypted: boolean;
  isEdrActive: boolean;
  isOsPatched: boolean;
  geoLatitude: number;
  geoLongitude: number;
  lastGeoLatitude?: number;
  lastGeoLongitude?: number;
  lastSignalEpochMs?: number;
}

export interface DevicePostureAttestationReceipt {
  receiptId: string;
  deviceId: string;
  operatorId: string;
  tenantId: string;
  postureScore: number; // 0..100
  trustTier: 'TRUSTED_TIER_1' | 'ACCEPTABLE_TIER_2' | 'UNTRUSTED_QUARANTINE';
  actionEnforced: 'ALLOW_SESSION' | 'REQUIRE_STEPUP_MFA' | 'REVOKE_ACTIVE_SESSION';
  attestationDigest: string;
  evaluatedAt: string;
}

/**
 * Continuous Zero-Trust Device Health & Behavioral Posture Attestation Engine
 * Specification: ZS-SOAR-DISP-001 §9 (Zero-Trust Endpoint & Identity Posture)
 */
@Injectable()
export class DevicePostureAttestationService {
  private readonly logger = new Logger(DevicePostureAttestationService.name);

  /**
   * Evaluates endpoint security signals and computes dynamic trust score.
   */
  evaluateDevicePosture(telemetry: DeviceTelemetrySignal): DevicePostureAttestationReceipt {
    const receiptId = `posture-rcpt-${crypto.randomUUID()}`;
    const evaluatedAt = new Date().toISOString();

    let postureScore = 0;

    // 1. Hardware Root of Trust (TPM 2.0): 25 pts
    if (telemetry.hasTpm2Hardware) postureScore += 25;

    // 2. Full Disk Encryption: 25 pts
    if (telemetry.isDiskEncrypted) postureScore += 25;

    // 3. EDR Sensor Active: 25 pts
    if (telemetry.isEdrActive) postureScore += 25;

    // 4. OS Patch Level: 15 pts
    if (telemetry.isOsPatched) postureScore += 15;

    // 5. Impossible Travel Geo-Velocity Check: 10 pts
    let impossibleTravelDetected = false;
    if (telemetry.lastGeoLatitude !== undefined && telemetry.lastGeoLongitude !== undefined && telemetry.lastSignalEpochMs) {
      const timeDiffHours = (Date.now() - telemetry.lastSignalEpochMs) / (1000 * 3600);
      const latDiff = Math.abs(telemetry.geoLatitude - telemetry.lastGeoLatitude);
      const lonDiff = Math.abs(telemetry.geoLongitude - telemetry.lastGeoLongitude);
      // Rough distance metric: > 30 degrees latitude or longitude in < 1 hour is physically impossible
      if ((latDiff > 30 || lonDiff > 30) && timeDiffHours < 1.0) {
        impossibleTravelDetected = true;
      }
    }

    if (!impossibleTravelDetected) {
      postureScore += 10;
    } else {
      postureScore = Math.max(0, postureScore - 50); // Severe penalty for impossible velocity
      this.logger.warn(`🚨 [IMPOSSIBLE TRAVEL DETECTED] Operator ${telemetry.operatorId} moved across continents in under an hour!`);
    }

    let trustTier: 'TRUSTED_TIER_1' | 'ACCEPTABLE_TIER_2' | 'UNTRUSTED_QUARANTINE';
    let actionEnforced: 'ALLOW_SESSION' | 'REQUIRE_STEPUP_MFA' | 'REVOKE_ACTIVE_SESSION';

    if (postureScore >= 85) {
      trustTier = 'TRUSTED_TIER_1';
      actionEnforced = 'ALLOW_SESSION';
    } else if (postureScore >= 60) {
      trustTier = 'ACCEPTABLE_TIER_2';
      actionEnforced = 'REQUIRE_STEPUP_MFA';
      this.logger.warn(`⚠️ [DEGRADED DEVICE POSTURE] Score: ${postureScore}/100. Enforcing Step-Up MFA.`);
    } else {
      trustTier = 'UNTRUSTED_QUARANTINE';
      actionEnforced = 'REVOKE_ACTIVE_SESSION';
      this.logger.error(`🚨 [DEVICE COMPROMISED/UNTRUSTED] Score: ${postureScore}/100. Revoking active OAuth/JWT sessions!`);
    }

    const attestationDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify({ receiptId, deviceId: telemetry.deviceId, postureScore, actionEnforced, evaluatedAt }))
      .digest('hex');

    this.logger.log(`Evaluated Device Posture [${telemetry.deviceId}] -> Score: ${postureScore}/100 (${trustTier}) -> Action: ${actionEnforced}`);

    return {
      receiptId,
      deviceId: telemetry.deviceId,
      operatorId: telemetry.operatorId,
      tenantId: telemetry.tenantId,
      postureScore,
      trustTier,
      actionEnforced,
      attestationDigest,
      evaluatedAt,
    };
  }
}
