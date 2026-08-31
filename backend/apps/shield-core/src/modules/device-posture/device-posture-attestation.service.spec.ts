import { DevicePostureAttestationService } from './device-posture-attestation.service';

describe('DevicePostureAttestationService', () => {
  let postureService: DevicePostureAttestationService;

  beforeEach(() => {
    postureService = new DevicePostureAttestationService();
  });

  it('should grant full access for healthy corporate device with 100/100 score', () => {
    const receipt = postureService.evaluateDevicePosture({
      deviceId: 'dev-macbook-pro-m3',
      operatorId: 'operator-alice',
      tenantId: 'tenant-enterprise-01',
      hasTpm2Hardware: true,
      isDiskEncrypted: true,
      isEdrActive: true,
      isOsPatched: true,
      geoLatitude: 37.7749,
      geoLongitude: -122.4194,
    });

    expect(receipt.receiptId).toBeDefined();
    expect(receipt.postureScore).toBe(100);
    expect(receipt.trustTier).toBe('TRUSTED_TIER_1');
    expect(receipt.actionEnforced).toBe('ALLOW_SESSION');
    expect(receipt.attestationDigest).toBeDefined();
  });

  it('should enforce step-up MFA for degraded device without disk encryption', () => {
    const receipt = postureService.evaluateDevicePosture({
      deviceId: 'dev-byod-laptop',
      operatorId: 'operator-bob',
      tenantId: 'tenant-enterprise-01',
      hasTpm2Hardware: true,
      isDiskEncrypted: false, // 25 pt penalty
      isEdrActive: true,
      isOsPatched: true,
      geoLatitude: 51.5074,
      geoLongitude: -0.1278,
    });

    expect(receipt.postureScore).toBe(75);
    expect(receipt.trustTier).toBe('ACCEPTABLE_TIER_2');
    expect(receipt.actionEnforced).toBe('REQUIRE_STEPUP_MFA');
  });

  it('should immediately revoke sessions upon impossible geo-travel anomaly', () => {
    const receipt = postureService.evaluateDevicePosture({
      deviceId: 'dev-compromised-token',
      operatorId: 'operator-charlie',
      tenantId: 'tenant-enterprise-01',
      hasTpm2Hardware: true,
      isDiskEncrypted: true,
      isEdrActive: true,
      isOsPatched: true,
      geoLatitude: -33.8688, // Sydney, Australia
      geoLongitude: 151.2093,
      lastGeoLatitude: 40.7128, // New York, USA
      lastGeoLongitude: -74.006,
      lastSignalEpochMs: Date.now() - 1000 * 60 * 10, // 10 minutes ago!
    });

    expect(receipt.postureScore).toBeLessThan(60);
    expect(receipt.trustTier).toBe('UNTRUSTED_QUARANTINE');
    expect(receipt.actionEnforced).toBe('REVOKE_ACTIVE_SESSION');
  });
});
