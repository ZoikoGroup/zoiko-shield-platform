import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CachedConnector {
  id: string;
  tenant_id: string;
  environment_id: string;
  source_region?: string | null;
  authentication_type?: string | null;
  cachedAt: number;
}

/**
 * High-performance in-memory connector metadata cache.
 * Eliminates synchronous database roundtrips on the high-throughput webhook ingest path (CTO Gap P1-09).
 */
@Injectable()
export class ConnectorCacheService {
  private readonly logger = new Logger(ConnectorCacheService.name);
  private readonly cache = new Map<string, CachedConnector>();
  private readonly ttlMs = 60_000; // 60 seconds TTL

  constructor(private readonly prisma: PrismaService) {}

  async getConnector(connectorId: string): Promise<CachedConnector | null> {
    const now = Date.now();
    const existing = this.cache.get(connectorId);

    if (existing && now - existing.cachedAt < this.ttlMs) {
      return existing;
    }

    // Cache miss or expired — fetch from PostgreSQL
    const connector = await this.prisma.connectorInstance.findUnique({
      where: { id: connectorId },
    });

    if (!connector) {
      this.cache.delete(connectorId);
      return null;
    }

    const cached: CachedConnector = {
      id: connector.id,
      tenant_id: connector.tenant_id,
      environment_id: connector.environment_id,
      source_region: connector.source_region,
      authentication_type: connector.authentication_type,
      cachedAt: now,
    };

    this.cache.set(connectorId, cached);
    return cached;
  }

  invalidate(connectorId: string): void {
    this.cache.delete(connectorId);
  }

  clear(): void {
    this.cache.clear();
  }
}
