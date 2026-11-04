import { QuarantineService } from './quarantine.service';
import { DlqReplayQuarantineService } from '../dlq/dlq-replay-quarantine.service';
import { createFakeDlqDb } from '../../test/fakes/fake-dlq-db';

describe('LAB 07 — OCSF Ingestion Normalization & Quarantine Provenance', () => {
  let quarantineService: QuarantineService;

  beforeEach(() => {
    quarantineService = new QuarantineService(
      new DlqReplayQuarantineService(
        createFakeDlqDb() as any,
        { republish: jest.fn() } as any,
      ),
    );
  });

  describe('Quarantine Screening & Lineage Preservation', () => {
    it('should isolate malformed payloads into quarantine with explicit failure reasons', async () => {
      const malformedPayload = '{"unclosed_json: true, "event_id": 123';
      const record = await quarantineService.quarantine({
        tenantId: 'tenant-alpha',
        environmentId: 'prod',
        connectorId: 'conn-aws-cloudtrail-01',
        sourceEventId: 'evt-raw-991',
        rawPayload: malformedPayload,
        failureReason: 'PARSER_EXCEPTION',
        errorMessage: 'JSON parse error at character 24: unexpected token',
      });

      expect(record.quarantineId).toBeDefined();
      expect(record.quarantineId.startsWith('dlq-')).toBe(true);
      expect(record.tenantId).toBe('tenant-alpha');
      expect(record.failureReason).toBe('PARSER_EXCEPTION');
      expect(record.status).toBe('PENDING_REVIEW');
      expect(record.payloadHash).toHaveLength(64); // SHA-256
      expect(record.rawPayload).toBe(malformedPayload);
    });

    it('should retain quarantined items per tenant and prevent cross-tenant leakage', async () => {
      await quarantineService.quarantine({
        tenantId: 'tenant-alpha',
        environmentId: 'prod',
        connectorId: 'conn-aws-01',
        rawPayload: 'bad data alpha',
        failureReason: 'SCHEMA_MISMATCH',
        errorMessage: 'Missing mandatory field observed_at',
      });

      await quarantineService.quarantine({
        tenantId: 'tenant-beta',
        environmentId: 'prod',
        connectorId: 'conn-azure-01',
        rawPayload: 'bad data beta',
        failureReason: 'UNSUPPORTED_VERSION',
        errorMessage: 'Unsupported schema version 9.9',
      });

      const alphaRecords =
        await quarantineService.listQuarantinedEvents('tenant-alpha');
      const betaRecords =
        await quarantineService.listQuarantinedEvents('tenant-beta');

      expect(alphaRecords.length).toBeGreaterThanOrEqual(1);
      expect(betaRecords.length).toBeGreaterThanOrEqual(1);
      expect(alphaRecords.every((r) => r.tenantId === 'tenant-alpha')).toBe(
        true,
      );
      expect(betaRecords.every((r) => r.tenantId === 'tenant-beta')).toBe(true);
    });
  });
});
