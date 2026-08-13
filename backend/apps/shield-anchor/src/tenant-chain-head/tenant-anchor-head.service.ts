import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The anchor's own strictly-increasing per-tenant sequence — independent
 * of the evidence ledger's own sequence (spec correction #4). Anti-
 * equivocation guarantee: a checkpoint can only be created by successfully
 * CAS-updating this row; a concurrent writer that loses the race gets a
 * clean failure, never a fork.
 */
@Injectable()
export class TenantAnchorHeadService {
  constructor(private readonly prisma: PrismaService) {}

  async readHead(tenantId: string) {
    const existing = await this.prisma.tenantAnchorHead.findUnique({
      where: { tenant_id: tenantId },
    });
    if (existing) return existing;
    // First use for this tenant — create the version:0 row.
    return this.prisma.tenantAnchorHead.upsert({
      where: { tenant_id: tenantId },
      create: { tenant_id: tenantId },
      update: {},
    });
  }

  /** Optimistic CAS — count !== 1 means a concurrent writer won the race; caller must fail closed, never retry into a fork. */
  async commitHead(
    tenantId: string,
    expectedVersion: number,
    newHead: {
      lastAnchorSequence: number;
      lastCheckpointId: string;
      lastCheckpointHash: string;
    },
  ): Promise<void> {
    const result = await this.prisma.tenantAnchorHead.updateMany({
      where: { tenant_id: tenantId, version: expectedVersion },
      data: {
        last_anchor_sequence: newHead.lastAnchorSequence,
        last_checkpoint_id: newHead.lastCheckpointId,
        last_checkpoint_hash: newHead.lastCheckpointHash,
        version: expectedVersion + 1,
      },
    });
    if (result.count !== 1) {
      throw new ConflictException(
        `TenantAnchorHead for '${tenantId}' was concurrently updated — checkpoint creation must retry against the new head, not fork`,
      );
    }
  }
}
