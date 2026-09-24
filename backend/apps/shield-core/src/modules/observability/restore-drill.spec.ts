import { BackupIntegrityService } from './backup-integrity.service';
import { RestoreDrillService } from './restore-drill.service';

describe('RestoreDrillService (Spec §26 Schema Integrity & Restore Drills)', () => {
  let backupService: BackupIntegrityService;
  let restoreService: RestoreDrillService;

  beforeEach(() => {
    backupService = new BackupIntegrityService();
    restoreService = new RestoreDrillService(backupService);
  });

  it('successfully executes a full restore drill with 100% table reconciliation and zero drift', async () => {
    const receipt = await restoreService.executeRestoreDrill('shield_core_db');

    expect(receipt.status).toBe('VERIFIED');
    expect(receipt.storeId).toBe('shield_core_db');
    expect(receipt.merkleHeadAligned).toBe(true);
    expect(receipt.rtoCompliant).toBe(true);
    expect(receipt.scratchSchemaTornDown).toBe(true);
    expect(receipt.discrepancies).toHaveLength(0);
    expect(receipt.totalTablesReconciled).toBe(6);
    expect(receipt.totalRowsReconciled).toBe(1326);
    expect(receipt.receiptSignatureSha256).toHaveLength(64);

    // Verify each table reconciliation entry
    for (const table of receipt.tableReconciliations) {
      expect(table.rowDriftCount).toBe(0);
      expect(table.checksumMatches).toBe(true);
      expect(table.foreignKeysValid).toBe(true);
    }

    // Verify that BackupIntegrityService was updated with new drill timestamp
    const posture = backupService.evaluateDisasterRecoveryPosture();
    expect(posture.stores.shield_core_db.lastRestoreDrillStatus).toBe(
      'VERIFIED',
    );
    expect(posture.stores.shield_core_db.restoreDrillAgeDays).toBe(0.0);
  });

  it('detects row count drift and records FAILED restore status in audit log', async () => {
    const receipt = await restoreService.executeRestoreDrill('shield_core_db', {
      simulateCorruptedRow: true,
    });

    expect(receipt.status).toBe('FAILED');
    expect(receipt.discrepancies.length).toBeGreaterThan(0);
    expect(receipt.discrepancies[0]).toContain(
      "Row count mismatch in table 'merkle_tree_leaves'",
    );

    const corruptedTable = receipt.tableReconciliations.find(
      (t) => t.tableName === 'merkle_tree_leaves',
    )!;
    expect(corruptedTable.rowDriftCount).toBe(1);
    expect(corruptedTable.checksumMatches).toBe(false);

    // Verify BackupIntegrityService updated with FAILED state
    const posture = backupService.evaluateDisasterRecoveryPosture();
    expect(posture.stores.shield_core_db.lastRestoreDrillStatus).toBe('FAILED');
  });

  it('detects Merkle root divergence and prevents false verification', async () => {
    const receipt = await restoreService.executeRestoreDrill('merkle_ledger', {
      simulateMerkleDrift: true,
    });

    expect(receipt.status).toBe('FAILED');
    expect(receipt.merkleHeadAligned).toBe(false);
    expect(
      receipt.discrepancies.some((d) =>
        d.includes('Merkle head root hash mismatch'),
      ),
    ).toBe(true);
  });
});
