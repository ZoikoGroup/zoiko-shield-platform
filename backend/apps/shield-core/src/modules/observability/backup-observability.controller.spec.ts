import { BackupObservabilityController } from './backup-observability.controller';
import { BackupIntegrityService } from './backup-integrity.service';
import { RestoreDrillService } from './restore-drill.service';

describe('BackupObservabilityController (Spec §26 Controller)', () => {
  let controller: BackupObservabilityController;
  let backupService: BackupIntegrityService;
  let restoreService: RestoreDrillService;

  beforeEach(() => {
    backupService = new BackupIntegrityService();
    restoreService = new RestoreDrillService(backupService);
    controller = new BackupObservabilityController(
      backupService,
      restoreService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('GET /api/v1/observability/backup/status returns posture summary', () => {
    const status = controller.getDisasterRecoveryStatus();
    expect(status.overallBackupHealth).toBe('HEALTHY');
    expect(status.stores.shield_core_db).toBeDefined();
    expect(status.stores.merkle_ledger).toBeDefined();
  });

  it('POST /api/v1/observability/backup/drill executes restore drill', async () => {
    const receipt = await controller.triggerRestoreDrill({
      storeId: 'shield_core_db',
    });
    expect(receipt.status).toBe('VERIFIED');
    expect(receipt.storeId).toBe('shield_core_db');
    expect(receipt.scratchSchemaTornDown).toBe(true);
  });
});
