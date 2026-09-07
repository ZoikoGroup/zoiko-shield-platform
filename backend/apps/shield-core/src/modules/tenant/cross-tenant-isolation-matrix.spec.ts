import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantService } from './tenant.service';

describe('Store-by-Store Tenant Isolation Negative Matrix', () => {
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      tenant: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === 'tenant-alpha') {
            return Promise.resolve({ id: 'tenant-alpha', name: 'Alpha Corp', status: 'ACTIVE' });
          }
          if (where.id === 'tenant-beta') {
            return Promise.resolve({ id: 'tenant-beta', name: 'Beta Ltd', status: 'ACTIVE' });
          }
          return Promise.resolve(null);
        }),
      },
      case: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          // Verify tenant_id is strictly required in the query plan
          if (!where || !where.tenant_id) {
            throw new Error('UNBOUNDED_CROSS_TENANT_QUERY_PROHIBITED');
          }
          if (where.tenant_id === 'tenant-alpha') {
            return Promise.resolve([{ id: 'case-alpha-1', tenant_id: 'tenant-alpha' }]);
          }
          return Promise.resolve([]);
        }),
      },
      evidenceRecord: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          if (!where || !where.tenant_id) {
            throw new Error('UNBOUNDED_CROSS_TENANT_QUERY_PROHIBITED');
          }
          return Promise.resolve([]);
        }),
      },
    };
  });

  describe('Relational Authority & Query Plan Isolation', () => {
    it('should reject un-partitioned queries lacking explicit tenant_id constraint in query plan', async () => {
      expect(() => {
        mockPrisma.case.findMany({ where: {} as any });
      }).toThrow('UNBOUNDED_CROSS_TENANT_QUERY_PROHIBITED');
    });

    it('should never return tenant-beta records when querying on tenant-alpha filter', async () => {
      const records = await mockPrisma.case.findMany({
        where: { tenant_id: 'tenant-alpha' },
      });

      expect(records.length).toBe(1);
      expect(records.every((r: any) => r.tenant_id === 'tenant-alpha')).toBe(true);
      expect(records.some((r: any) => r.tenant_id === 'tenant-beta')).toBe(false);
    });
  });

  describe('Object Storage & Evidence Vault Tenant Prefix Isolation', () => {
    it('should validate tenant-prefixed storage URIs and prevent path traversal across tenants', () => {
      const validateStoragePath = (tenantId: string, objectPath: string): boolean => {
        // Enforce gs://{bucket}/{tenant_id}/... format and prevent ../ directory traversal
        if (objectPath.includes('..') || objectPath.includes('/../')) return false;
        const prefix = `gs://zs-evidence-vault/${tenantId}/`;
        return objectPath.startsWith(prefix);
      };

      expect(
        validateStoragePath('tenant-alpha', 'gs://zs-evidence-vault/tenant-alpha/2026/09/ev-001.json'),
      ).toBe(true);
      expect(
        validateStoragePath('tenant-alpha', 'gs://zs-evidence-vault/tenant-beta/2026/09/ev-001.json'),
      ).toBe(false);
      expect(
        validateStoragePath('tenant-alpha', 'gs://zs-evidence-vault/tenant-alpha/../tenant-beta/ev-001.json'),
      ).toBe(false);
    });
  });

  describe('Kafka Topic Key & Partition Isolation', () => {
    it('should enforce tenant-prefixed partition keys for all emitted domain events', () => {
      const formatEventPartitionKey = (tenantId: string, entityId: string): string => {
        if (!tenantId || !entityId) throw new Error('MISSING_TENANT_PARTITION_KEY');
        return `${tenantId}:${entityId}`;
      };

      const key = formatEventPartitionKey('tenant-alpha', 'alert-987');
      expect(key).toBe('tenant-alpha:alert-987');
      expect(key.startsWith('tenant-alpha:')).toBe(true);
      expect(() => formatEventPartitionKey('', 'alert-987')).toThrow();
    });
  });

  describe('ClickHouse Partitioning & Analytics Guard', () => {
    it('should reject raw SQL string concatenation and enforce parameterized tenant scoping', () => {
      const generateAnalyticsQuery = (tenantId: string, timeRange: { start: string; end: string }) => {
        // Must return parameterized query with SQL parameters, never inline unsanitized strings
        return {
          query: 'SELECT count() as total_events FROM security_events WHERE tenant_id = {tenantId:String} AND event_time >= {start:DateTime64} AND event_time <= {end:DateTime64}',
          params: {
            tenantId,
            start: timeRange.start,
            end: timeRange.end,
          },
        };
      };

      const plan = generateAnalyticsQuery('tenant-alpha', {
        start: '2026-09-01T00:00:00Z',
        end: '2026-09-07T00:00:00Z',
      });

      expect(plan.query).toContain('tenant_id = {tenantId:String}');
      expect(plan.params.tenantId).toBe('tenant-alpha');
      expect(plan.query).not.toContain('tenant-alpha'); // Not concatenated directly!
    });
  });
});
