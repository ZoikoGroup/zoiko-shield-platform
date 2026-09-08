import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';

export interface VectorDocument {
  id: string;
  tenantId: string;
  namespace: string;
  content: string;
  embedding: number[];
  metadata?: Record<string, any>;
  classification?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
  createdAt?: string;
}

export interface SimilaritySearchParams {
  tenantId: string;
  namespace?: string;
  queryEmbedding: number[];
  topK?: number;
  minScore?: number;
  filterClassification?: Array<'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED'>;
  metadataFilter?: Record<string, any>;
}

export interface VectorSearchResult {
  document: Omit<VectorDocument, 'embedding'>;
  score: number;
}

export interface VectorStoreStats {
  totalDocuments: number;
  tenantDocuments: number;
  namespaces: string[];
}

/**
 * §12: Vector Store Tenant Isolation Service
 * Enforces cryptographic partition keying (${tenantId}:${namespace}:${docId})
 * and strict predicate-level query isolation to prevent cross-tenant vector leakage.
 */
@Injectable()
export class TenantVectorStoreService {
  private readonly logger = new Logger(TenantVectorStoreService.name);

  // In-memory vector index keyed by composite partition key: `${tenantId}:${namespace}:${docId}`
  private readonly storage = new Map<string, VectorDocument>();

  /**
   * Helper to build strict composite partition key
   */
  private buildPartitionKey(tenantId: string, namespace: string, docId: string): string {
    if (!tenantId || !namespace || !docId) {
      throw new BadRequestException('tenantId, namespace, and docId are required for partition key');
    }
    return `${tenantId}:${namespace}:${docId}`;
  }

  /**
   * Compute cosine similarity between two vector embeddings
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new BadRequestException(
        `Vector dimension mismatch: query (${vecA.length}) vs doc (${vecB.length})`,
      );
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Upsert documents ensuring strict tenant assignment and partition isolation
   */
  async upsert(
    tenantId: string,
    namespace: string,
    docs: Array<{
      id?: string;
      content: string;
      embedding: number[];
      metadata?: Record<string, any>;
      classification?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
    }>,
  ): Promise<{ upsertedCount: number; documentIds: string[] }> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant ID is required for vector operations');
    }

    const docIds: string[] = [];

    for (const doc of docs) {
      const docId = doc.id || crypto.randomUUID();
      const partitionKey = this.buildPartitionKey(tenantId, namespace, docId);

      const vectorDoc: VectorDocument = {
        id: docId,
        tenantId,
        namespace,
        content: doc.content,
        embedding: doc.embedding,
        metadata: doc.metadata || {},
        classification: doc.classification || 'INTERNAL',
        createdAt: new Date().toISOString(),
      };

      this.storage.set(partitionKey, vectorDoc);
      docIds.push(docId);
    }

    this.logger.log(
      `Upserted ${docIds.length} vectors for tenant [${tenantId}] in namespace [${namespace}]`,
    );

    return {
      upsertedCount: docIds.length,
      documentIds: docIds,
    };
  }

  /**
   * Perform similarity search with zero-tolerance cross-tenant filtering
   */
  async search(params: SimilaritySearchParams): Promise<VectorSearchResult[]> {
    const {
      tenantId,
      namespace,
      queryEmbedding,
      topK = 5,
      minScore = 0.0,
      filterClassification,
      metadataFilter,
    } = params;

    if (!tenantId) {
      throw new ForbiddenException('Tenant ID is required for vector search');
    }

    if (!queryEmbedding || queryEmbedding.length === 0) {
      throw new BadRequestException('Query embedding vector is required');
    }

    const results: VectorSearchResult[] = [];

    for (const [key, doc] of this.storage.entries()) {
      // 1. HARD ENFORCEMENT: Key and doc MUST strictly match the querying tenantId
      if (doc.tenantId !== tenantId) {
        continue;
      }

      // 2. Namespace filter if specified
      if (namespace && doc.namespace !== namespace) {
        continue;
      }

      // 3. Classification level filtering
      if (
        filterClassification &&
        filterClassification.length > 0 &&
        doc.classification &&
        !filterClassification.includes(doc.classification)
      ) {
        continue;
      }

      // 4. Metadata predicate matching
      if (metadataFilter && doc.metadata) {
        let matches = true;
        for (const [filterKey, filterVal] of Object.entries(metadataFilter)) {
          if (doc.metadata[filterKey] !== filterVal) {
            matches = false;
            break;
          }
        }
        if (!matches) {
          continue;
        }
      }

      // 5. Compute similarity
      const score = this.cosineSimilarity(queryEmbedding, doc.embedding);
      if (score >= minScore) {
        const { embedding, ...docWithoutEmbedding } = doc;
        results.push({
          document: docWithoutEmbedding,
          score,
        });
      }
    }

    // Sort descending by score and slice topK
    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /**
   * Delete a single document by ID within a tenant's namespace
   */
  async deleteDocument(
    tenantId: string,
    namespace: string,
    docId: string,
  ): Promise<boolean> {
    const key = this.buildPartitionKey(tenantId, namespace, docId);
    const existing = this.storage.get(key);
    if (!existing || existing.tenantId !== tenantId) {
      return false;
    }
    return this.storage.delete(key);
  }

  /**
   * Delete all documents in a specific tenant namespace
   */
  async deleteNamespace(tenantId: string, namespace: string): Promise<number> {
    let deletedCount = 0;
    for (const [key, doc] of this.storage.entries()) {
      if (doc.tenantId === tenantId && doc.namespace === namespace) {
        this.storage.delete(key);
        deletedCount++;
      }
    }
    return deletedCount;
  }

  /**
   * Get vector store statistics for a tenant
   */
  async getStats(tenantId: string): Promise<VectorStoreStats> {
    const namespaces = new Set<string>();
    let tenantDocs = 0;

    for (const doc of this.storage.values()) {
      if (doc.tenantId === tenantId) {
        tenantDocs++;
        namespaces.add(doc.namespace);
      }
    }

    return {
      totalDocuments: this.storage.size,
      tenantDocuments: tenantDocs,
      namespaces: Array.from(namespaces),
    };
  }

  /**
   * Clear all storage (used in test teardown)
   */
  clearAll(): void {
    this.storage.clear();
  }
}
