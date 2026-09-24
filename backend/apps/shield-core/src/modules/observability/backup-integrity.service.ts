import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export type DataStoreId =
  'shield_core_db' | 'merkle_ledger' | 'timeseries_telemetry' | 'audit_vault';

export type RpoStatus = 'COMPLIANT' | 'WARNING' | 'BREACHED';
export type RestoreVerificationStatus =
  'VERIFIED' | 'FAILED' | 'UNVERIFIED' | 'STALE';

export interface DataStoreBackupRecord {
  storeId: DataStoreId;
  displayName: string;
  storeType:
    | 'RELATIONAL_POSTGRES'
    | 'IMMUTABLE_MERKLE_TREE'
    | 'TIMESERIES_ANALYTICS'
    | 'COMPLIANCE_VAULT';
  lastBackupCompletedAt: string;
  backupAgeHours: number;
  backupSizeBytes: number;
  rpoTargetMinutes: number;
  rpoStatus: RpoStatus;
  encryptionAlgorithm: 'AES_256_GCM' | 'KMS_ENVELOPE_AES256' | 'NONE';
  encryptionVerified: boolean;
  immutabilityLocked: boolean; // WORM object-lock
  retentionDays: number;
  manifestChecksumSha256: string;
  lastRestoreDrillAt: string;
  lastRestoreDrillStatus: RestoreVerificationStatus;
  restoreDrillAgeDays: number;
}

export interface DisasterRecoveryPostureSummary {
  assessedAt: string;
  overallBackupHealth: 'HEALTHY' | 'AT_RISK' | 'DEGRADED';
  overallRpoCompliant: boolean;
  overallRestoreVerified: boolean;
  activeStoresCount: number;
  healthyStoresCount: number;
  staleBackupsCount: number;
  unverifiedRestoresCount: number;
  rtoTargetHours: number;
  stores: Record<DataStoreId, DataStoreBackupRecord>;
  attestationDigest: string;
}

/**
 * Spec §26: Backup, Restore, Disaster Recovery and Integrity Reconciliation
 * Tracks coverage, freshness, encryption, immutability, and restore readiness across all core data stores.
 */
@Injectable()
export class BackupIntegrityService {
  private readonly logger = new Logger(BackupIntegrityService.name);

  // In-memory store state for live updates and drill recordings
  private dataStoreBackups: Map<DataStoreId, DataStoreBackupRecord> = new Map();

  constructor() {
    this.initializeDefaultStoreState();
  }

  private initializeDefaultStoreState(): void {
    const now = new Date();
    const fourHoursAgo = new Date(
      now.getTime() - 4 * 60 * 60 * 1000,
    ).toISOString();
    const twoDaysAgo = new Date(
      now.getTime() - 48 * 60 * 60 * 1000,
    ).toISOString();

    const defaultRecords: DataStoreBackupRecord[] = [
      {
        storeId: 'shield_core_db',
        displayName: 'ZoikoShield Primary Relational State (PostgreSQL)',
        storeType: 'RELATIONAL_POSTGRES',
        lastBackupCompletedAt: fourHoursAgo,
        backupAgeHours: 4.0,
        backupSizeBytes: 52428800, // 50 MB
        rpoTargetMinutes: 15,
        rpoStatus: 'COMPLIANT',
        encryptionAlgorithm: 'KMS_ENVELOPE_AES256',
        encryptionVerified: true,
        immutabilityLocked: true,
        retentionDays: 90,
        manifestChecksumSha256: crypto
          .createHash('sha256')
          .update('shield_core_db_snap_001')
          .digest('hex'),
        lastRestoreDrillAt: twoDaysAgo,
        lastRestoreDrillStatus: 'VERIFIED',
        restoreDrillAgeDays: 2.0,
      },
      {
        storeId: 'merkle_ledger',
        displayName: 'Immutable Checkpoint & Proof Ledger (RFC3161)',
        storeType: 'IMMUTABLE_MERKLE_TREE',
        lastBackupCompletedAt: fourHoursAgo,
        backupAgeHours: 4.0,
        backupSizeBytes: 12582912, // 12 MB
        rpoTargetMinutes: 5,
        rpoStatus: 'COMPLIANT',
        encryptionAlgorithm: 'AES_256_GCM',
        encryptionVerified: true,
        immutabilityLocked: true,
        retentionDays: 365,
        manifestChecksumSha256: crypto
          .createHash('sha256')
          .update('merkle_ledger_snap_001')
          .digest('hex'),
        lastRestoreDrillAt: twoDaysAgo,
        lastRestoreDrillStatus: 'VERIFIED',
        restoreDrillAgeDays: 2.0,
      },
      {
        storeId: 'timeseries_telemetry',
        displayName: 'Security Event Stream & Telemetry Storage',
        storeType: 'TIMESERIES_ANALYTICS',
        lastBackupCompletedAt: fourHoursAgo,
        backupAgeHours: 4.0,
        backupSizeBytes: 104857600, // 100 MB
        rpoTargetMinutes: 60,
        rpoStatus: 'COMPLIANT',
        encryptionAlgorithm: 'AES_256_GCM',
        encryptionVerified: true,
        immutabilityLocked: false,
        retentionDays: 30,
        manifestChecksumSha256: crypto
          .createHash('sha256')
          .update('timeseries_telemetry_snap_001')
          .digest('hex'),
        lastRestoreDrillAt: twoDaysAgo,
        lastRestoreDrillStatus: 'VERIFIED',
        restoreDrillAgeDays: 2.0,
      },
      {
        storeId: 'audit_vault',
        displayName: 'G1 Evidence & Regulatory Audit Package Vault',
        storeType: 'COMPLIANCE_VAULT',
        lastBackupCompletedAt: fourHoursAgo,
        backupAgeHours: 4.0,
        backupSizeBytes: 20971520, // 20 MB
        rpoTargetMinutes: 1440,
        rpoStatus: 'COMPLIANT',
        encryptionAlgorithm: 'KMS_ENVELOPE_AES256',
        encryptionVerified: true,
        immutabilityLocked: true,
        retentionDays: 2555, // 7 years statutory
        manifestChecksumSha256: crypto
          .createHash('sha256')
          .update('audit_vault_snap_001')
          .digest('hex'),
        lastRestoreDrillAt: twoDaysAgo,
        lastRestoreDrillStatus: 'VERIFIED',
        restoreDrillAgeDays: 2.0,
      },
    ];

    for (const record of defaultRecords) {
      this.dataStoreBackups.set(record.storeId, record);
    }
  }

  /**
   * Assesses and returns the comprehensive Disaster Recovery posture per Spec §26.
   */
  public evaluateDisasterRecoveryPosture(customOverrides?: {
    storeOverrides?: Partial<
      Record<DataStoreId, Partial<DataStoreBackupRecord>>
    >;
  }): DisasterRecoveryPostureSummary {
    const assessedAt = new Date().toISOString();
    const storesMap: Partial<Record<DataStoreId, DataStoreBackupRecord>> = {};

    let staleCount = 0;
    let unverifiedCount = 0;
    let healthyCount = 0;

    const storeIds: DataStoreId[] = [
      'shield_core_db',
      'merkle_ledger',
      'timeseries_telemetry',
      'audit_vault',
    ];

    for (const storeId of storeIds) {
      const base = this.dataStoreBackups.get(storeId)!;
      const override = customOverrides?.storeOverrides?.[storeId];
      const record: DataStoreBackupRecord = { ...base, ...override };

      // Re-evaluate RPO status dynamically based on age
      if (record.backupAgeHours > 24.0) {
        record.rpoStatus = 'BREACHED';
        staleCount += 1;
      } else if (record.backupAgeHours > 12.0) {
        record.rpoStatus = 'WARNING';
      } else {
        record.rpoStatus = 'COMPLIANT';
      }

      // Re-evaluate restore verification status
      if (
        record.restoreDrillAgeDays > 30.0 ||
        record.lastRestoreDrillStatus === 'FAILED'
      ) {
        record.lastRestoreDrillStatus =
          record.lastRestoreDrillStatus === 'FAILED' ? 'FAILED' : 'STALE';
        unverifiedCount += 1;
      }

      if (
        record.rpoStatus === 'COMPLIANT' &&
        record.lastRestoreDrillStatus === 'VERIFIED' &&
        record.encryptionVerified
      ) {
        healthyCount += 1;
      }

      storesMap[storeId] = record;
    }

    const stores = storesMap as Record<DataStoreId, DataStoreBackupRecord>;
    const overallRpoCompliant = staleCount === 0;
    const overallRestoreVerified = unverifiedCount === 0;

    let overallBackupHealth: 'HEALTHY' | 'AT_RISK' | 'DEGRADED' = 'HEALTHY';
    if (staleCount > 0 || unverifiedCount > 1) {
      overallBackupHealth = 'DEGRADED';
    } else if (unverifiedCount === 1) {
      overallBackupHealth = 'AT_RISK';
    }

    const summary: DisasterRecoveryPostureSummary = {
      assessedAt,
      overallBackupHealth,
      overallRpoCompliant,
      overallRestoreVerified,
      activeStoresCount: storeIds.length,
      healthyStoresCount: healthyCount,
      staleBackupsCount: staleCount,
      unverifiedRestoresCount: unverifiedCount,
      rtoTargetHours: 4.0,
      stores,
      attestationDigest: '',
    };

    summary.attestationDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify({ assessedAt, overallBackupHealth, stores }))
      .digest('hex');

    return summary;
  }

  /**
   * Updates data store state following a verified restore drill execution.
   */
  public recordRestoreDrillResult(
    storeId: DataStoreId,
    status: RestoreVerificationStatus,
    drillTimestamp: string,
  ): DataStoreBackupRecord {
    const existing = this.dataStoreBackups.get(storeId);
    if (!existing) {
      throw new Error(`Unknown data store '${storeId}'`);
    }

    const updated: DataStoreBackupRecord = {
      ...existing,
      lastRestoreDrillAt: drillTimestamp,
      lastRestoreDrillStatus: status,
      restoreDrillAgeDays: 0.0,
    };

    this.dataStoreBackups.set(storeId, updated);
    this.logger.log(
      `✔ Recorded Spec §26 Restore Drill for '${storeId}': ${status}`,
    );
    return updated;
  }
}
