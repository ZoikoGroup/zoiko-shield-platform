import { BackupIntegrityService } from './backup-integrity.service';

describe('BackupIntegrityService (Spec §26 Backup & DR Integrity)', () => {
  let service: BackupIntegrityService;

  beforeEach(() => {
    service = new BackupIntegrityService();
  });

  it('evaluates optimal default posture across all 4 canonical data stores', () => {
    const posture = service.evaluateDisasterRecoveryPosture();

    expect(posture.overallBackupHealth).toBe('HEALTHY');
    expect(posture.overallRpoCompliant).toBe(true);
    expect(posture.overallRestoreVerified).toBe(true);
    expect(posture.activeStoresCount).toBe(4);
    expect(posture.healthyStoresCount).toBe(4);
    expect(posture.staleBackupsCount).toBe(0);
    expect(posture.unverifiedRestoresCount).toBe(0);
    expect(posture.rtoTargetHours).toBe(4.0);

    // Verify all 4 stores are present
    expect(posture.stores.shield_core_db).toBeDefined();
    expect(posture.stores.merkle_ledger).toBeDefined();
    expect(posture.stores.timeseries_telemetry).toBeDefined();
    expect(posture.stores.audit_vault).toBeDefined();

    // Verify SHA-256 digest format
    expect(posture.attestationDigest).toHaveLength(64);
  });

  it('detects stale backup exceeding 24 hours and flags RPO breach', () => {
    const posture = service.evaluateDisasterRecoveryPosture({
      storeOverrides: {
        shield_core_db: {
          backupAgeHours: 28.5,
        },
      },
    });

    expect(posture.overallBackupHealth).toBe('DEGRADED');
    expect(posture.overallRpoCompliant).toBe(false);
    expect(posture.staleBackupsCount).toBe(1);
    expect(posture.stores.shield_core_db.rpoStatus).toBe('BREACHED');
  });

  it('detects stale restore test exceeding 30 days and flags unverified restore', () => {
    const posture = service.evaluateDisasterRecoveryPosture({
      storeOverrides: {
        merkle_ledger: {
          restoreDrillAgeDays: 45.0,
        },
      },
    });

    expect(posture.overallBackupHealth).toBe('AT_RISK');
    expect(posture.overallRestoreVerified).toBe(false);
    expect(posture.unverifiedRestoresCount).toBe(1);
    expect(posture.stores.merkle_ledger.lastRestoreDrillStatus).toBe('STALE');
  });

  it('records successful restore drill execution and updates recency', () => {
    const drillTimestamp = new Date().toISOString();
    const updated = service.recordRestoreDrillResult(
      'shield_core_db',
      'VERIFIED',
      drillTimestamp,
    );

    expect(updated.lastRestoreDrillAt).toBe(drillTimestamp);
    expect(updated.lastRestoreDrillStatus).toBe('VERIFIED');
    expect(updated.restoreDrillAgeDays).toBe(0.0);

    const posture = service.evaluateDisasterRecoveryPosture();
    expect(posture.stores.shield_core_db.lastRestoreDrillStatus).toBe(
      'VERIFIED',
    );
  });

  it('throws error when recording restore drill for unknown data store', () => {
    expect(() => {
      service.recordRestoreDrillResult(
        'non_existent_store' as any,
        'VERIFIED',
        new Date().toISOString(),
      );
    }).toThrow("Unknown data store 'non_existent_store'");
  });
});
