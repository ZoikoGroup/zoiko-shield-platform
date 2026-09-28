import { GcsObjectStorageService } from '../evidence/storage/gcs-object-storage.service';
import { OutboxEventDispatcherService } from '../outbox/outbox-event-dispatcher.service';
import { DistributedOutboxRelayService } from '../outbox/distributed-outbox-relay.service';

/**
 * Store-by-store tenant isolation.
 *
 * The database-level guarantee (Postgres RLS enforced strictly below the
 * application query layer — the part that actually matters: rows are
 * invisible even to an unscoped or malformed query) is exercised against a
 * real PostgreSQL in `apps/shield-core/test/tenant-isolation.rls-spec.ts`
 * (`npm run test:rls`). This file only covers the non-database tenant-prefix
 * concerns below, against the real services that implement them.
 *
 * ClickHouse tenant-scoped, parameterized query safety is covered for real
 * in `apps/shield-ingest/src/analytics/clickhouse-analytical-detections.spec.ts`.
 */
describe('Store-by-Store Tenant Isolation (Object Storage & Outbox Partitioning)', () => {
  describe('Object Storage & Evidence Vault Tenant Prefix Isolation', () => {
    let storage: GcsObjectStorageService;

    beforeEach(() => {
      storage = new GcsObjectStorageService();
    });

    it('always keys evidence objects under the owning tenant prefix', () => {
      const key = storage.buildObjectKey('tenant-alpha', 'ev-001');
      expect(key).toBe('tenant-alpha/ev-001');
      expect(key.startsWith('tenant-alpha/')).toBe(true);
    });

    it('keeps the tenant-alpha prefix even for an adversarial evidence ID, so prefix-scoped listing (purgeTenantObjects/countTenantObjectVersions) can never be tricked into matching another tenant', () => {
      const key = storage.buildObjectKey(
        'tenant-alpha',
        '../tenant-beta/ev-001',
      );
      // Cloud Storage object names are flat, opaque strings — there is no
      // filesystem-style ".." resolution, so this key is never listed under
      // 'tenant-beta/'. It must still start with the real owning prefix.
      expect(key.startsWith('tenant-alpha/')).toBe(true);
      expect(key.startsWith('tenant-beta/')).toBe(false);
    });

    it('never produces the same key for two different tenants given the same evidence ID', () => {
      const keyAlpha = storage.buildObjectKey('tenant-alpha', 'ev-shared-id');
      const keyBeta = storage.buildObjectKey('tenant-beta', 'ev-shared-id');
      expect(keyAlpha).not.toBe(keyBeta);
    });
  });

  describe('Outbox Partition Key Isolation', () => {
    let dispatcher: OutboxEventDispatcherService;

    beforeEach(() => {
      dispatcher = new OutboxEventDispatcherService(
        new DistributedOutboxRelayService(),
      );
    });

    it('partitions every dispatched domain event by tenant', () => {
      const record = dispatcher.dispatch({
        eventType: 'ALERT_CREATED',
        tenantId: 'tenant-alpha',
        environmentId: 'env-prod',
        correlationId: 'corr-1',
        payload: {},
      });

      expect(record.partitionKey).toBe('tenant-alpha:env-prod');
      expect(record.partitionKey.startsWith('tenant-alpha:')).toBe(true);
    });

    it('rejects a domain event with no tenant context rather than dispatching it unpartitioned', () => {
      expect(() =>
        dispatcher.dispatch({
          eventType: 'ALERT_CREATED',
          tenantId: '',
          environmentId: 'env-prod',
          correlationId: 'corr-1',
          payload: {},
        }),
      ).toThrow();
    });

    it('gives two different tenants distinct partition keys for the same environment', () => {
      const alpha = dispatcher.dispatch({
        eventType: 'ALERT_CREATED',
        tenantId: 'tenant-alpha',
        environmentId: 'env-prod',
        correlationId: 'corr-1',
        payload: {},
      });
      const beta = dispatcher.dispatch({
        eventType: 'ALERT_CREATED',
        tenantId: 'tenant-beta',
        environmentId: 'env-prod',
        correlationId: 'corr-2',
        payload: {},
      });

      expect(alpha.partitionKey).not.toBe(beta.partitionKey);
    });
  });
});
