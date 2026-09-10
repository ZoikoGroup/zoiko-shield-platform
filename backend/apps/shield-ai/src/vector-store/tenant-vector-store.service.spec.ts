import { Test, TestingModule } from '@nestjs/testing';
import { TenantVectorStoreService } from './tenant-vector-store.service';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

describe('TenantVectorStoreService (§12 Vector Store & Tenant Isolation)', () => {
  let service: TenantVectorStoreService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantVectorStoreService],
    }).compile();

    service = module.get<TenantVectorStoreService>(TenantVectorStoreService);
    service.clearAll();
  });

  afterEach(() => {
    service.clearAll();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Upsert and Single-Tenant Search', () => {
    it('should successfully upsert documents and return relevant similarity results', async () => {
      const tenantId = 'tenant-alpha';
      const namespace = 'security-policies';

      const upsertRes = await service.upsert(tenantId, namespace, [
        {
          id: 'doc-1',
          content:
            'Password complexity requirements: minimum 14 characters with MFA',
          embedding: [1, 0, 0],
          classification: 'INTERNAL',
          metadata: { category: 'auth' },
        },
        {
          id: 'doc-2',
          content: 'Data retention policy: retain security logs for 365 days',
          embedding: [0, 1, 0],
          classification: 'INTERNAL',
          metadata: { category: 'compliance' },
        },
      ]);

      expect(upsertRes.upsertedCount).toBe(2);
      expect(upsertRes.documentIds).toEqual(['doc-1', 'doc-2']);

      const searchResults = await service.search({
        tenantId,
        namespace,
        queryEmbedding: [0.9, 0.1, 0],
        topK: 1,
      });

      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].document.id).toBe('doc-1');
      expect(searchResults[0].score).toBeGreaterThan(0.9);
      expect(searchResults[0].document.content).toContain(
        'Password complexity',
      );
    });
  });

  describe('Strict Cross-Tenant Isolation (Negative Testing)', () => {
    it('should NEVER return documents from Tenant B when queried by Tenant A even with identical embeddings (cosine = 1.0)', async () => {
      const tenantA = 'tenant-bank-corp';
      const tenantB = 'tenant-healthcare-inc';
      const sharedNamespace = 'incident-response';

      // Tenant A stores confidential IR playbook
      await service.upsert(tenantA, sharedNamespace, [
        {
          id: 'ir-doc-alpha',
          content: 'Bank Corp incident response: notify SEC within 4 days',
          embedding: [0.5, 0.5, 0.707],
          classification: 'RESTRICTED',
        },
      ]);

      // Tenant B stores highly confidential patient IR playbook with exact same embedding
      await service.upsert(tenantB, sharedNamespace, [
        {
          id: 'ir-doc-beta',
          content: 'Healthcare Inc incident response: HIPAA breach protocol',
          embedding: [0.5, 0.5, 0.707],
          classification: 'RESTRICTED',
        },
      ]);

      // Query from Tenant A
      const resultsTenantA = await service.search({
        tenantId: tenantA,
        queryEmbedding: [0.5, 0.5, 0.707],
        topK: 10,
      });

      expect(resultsTenantA).toHaveLength(1);
      expect(resultsTenantA[0].document.id).toBe('ir-doc-alpha');
      expect(resultsTenantA[0].document.tenantId).toBe(tenantA);

      // Verify that NO documents from Tenant B leaked into Tenant A's results
      const leakedDocs = resultsTenantA.filter(
        (r) =>
          r.document.tenantId === tenantB || r.document.id === 'ir-doc-beta',
      );
      expect(leakedDocs).toHaveLength(0);

      // Query from Tenant B
      const resultsTenantB = await service.search({
        tenantId: tenantB,
        queryEmbedding: [0.5, 0.5, 0.707],
        topK: 10,
      });

      expect(resultsTenantB).toHaveLength(1);
      expect(resultsTenantB[0].document.id).toBe('ir-doc-beta');
      expect(resultsTenantB[0].document.tenantId).toBe(tenantB);
    });

    it('should reject search without tenantId with ForbiddenException', async () => {
      await expect(
        service.search({
          tenantId: '',
          queryEmbedding: [1, 0, 0],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject dimension mismatch with BadRequestException', async () => {
      const tenantId = 'tenant-gamma';
      await service.upsert(tenantId, 'default', [
        {
          id: 'doc-3dim',
          content: '3D vector',
          embedding: [1, 0, 0],
        },
      ]);

      await expect(
        service.search({
          tenantId,
          queryEmbedding: [1, 0, 0, 0, 0], // 5D query against 3D index
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Namespace Isolation & Deletion', () => {
    it('should isolate search by namespace within the same tenant', async () => {
      const tenantId = 'tenant-multi-ns';

      await service.upsert(tenantId, 'soc2-controls', [
        {
          id: 'soc2-1',
          content: 'SOC2 Access control policy',
          embedding: [0.7, 0.7, 0],
        },
      ]);

      await service.upsert(tenantId, 'iso-controls', [
        {
          id: 'iso-1',
          content: 'ISO 27001 ISMS scope',
          embedding: [0.7, 0.7, 0],
        },
      ]);

      const soc2Results = await service.search({
        tenantId,
        namespace: 'soc2-controls',
        queryEmbedding: [0.7, 0.7, 0],
      });

      expect(soc2Results).toHaveLength(1);
      expect(soc2Results[0].document.id).toBe('soc2-1');

      // Delete the namespace and verify isolation
      const deleted = await service.deleteNamespace(tenantId, 'soc2-controls');
      expect(deleted).toBe(1);

      const soc2ResultsAfterDelete = await service.search({
        tenantId,
        namespace: 'soc2-controls',
        queryEmbedding: [0.7, 0.7, 0],
      });
      expect(soc2ResultsAfterDelete).toHaveLength(0);

      // ISO controls should still exist
      const isoResults = await service.search({
        tenantId,
        namespace: 'iso-controls',
        queryEmbedding: [0.7, 0.7, 0],
      });
      expect(isoResults).toHaveLength(1);
    });
  });
});
