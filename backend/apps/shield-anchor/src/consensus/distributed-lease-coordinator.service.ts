import { Injectable, Logger } from '@nestjs/common';

export interface LeaseRecord {
  resourceKey: string;
  holderNodeId: string;
  region: string;
  fencingToken: number;
  acquiredAt: number;
  expiresAt: number;
  renewCount: number;
}

export interface LeaseAcquisitionResult {
  resourceKey: string;
  acquired: boolean;
  holderNodeId: string;
  region: string;
  fencingToken: number;
  expiresAt: number;
  reason?: string;
}

@Injectable()
export class DistributedLeaseCoordinatorService {
  private readonly logger = new Logger(DistributedLeaseCoordinatorService.name);

  // In-memory cluster lease registry
  private readonly leases = new Map<string, LeaseRecord>();

  // Global monotonic sequence for fencing tokens (Martin Kleppmann fencing pattern)
  private globalFencingSequence = 1000;

  /**
   * Attempts to acquire an exclusive distributed lease for a resource.
   */
  acquireLease(
    resourceKey: string,
    holderNodeId: string,
    region: string,
    ttlMs = 5000,
  ): LeaseAcquisitionResult {
    const now = Date.now();
    const existing = this.leases.get(resourceKey);

    if (existing && existing.expiresAt > now) {
      if (existing.holderNodeId === holderNodeId) {
        // Re-entrant acquisition
        return this.renewLease(
          resourceKey,
          holderNodeId,
          existing.fencingToken,
          ttlMs,
        );
      }
      return {
        resourceKey,
        acquired: false,
        holderNodeId: existing.holderNodeId,
        region: existing.region,
        fencingToken: existing.fencingToken,
        expiresAt: existing.expiresAt,
        reason: `Lease currently held by node '${existing.holderNodeId}' in region '${existing.region}' until ${new Date(existing.expiresAt).toISOString()}`,
      };
    }

    // Allocate next monotonic fencing token
    this.globalFencingSequence++;
    const fencingToken = this.globalFencingSequence;

    const newLease: LeaseRecord = {
      resourceKey,
      holderNodeId,
      region,
      fencingToken,
      acquiredAt: now,
      expiresAt: now + ttlMs,
      renewCount: 0,
    };

    this.leases.set(resourceKey, newLease);

    this.logger.log(
      `🔒 [LEASE ACQUIRED] Resource '${resourceKey}' granted to '${holderNodeId}' (${region}) with FencingToken=${fencingToken} (TTL: ${ttlMs}ms)`,
    );

    return {
      resourceKey,
      acquired: true,
      holderNodeId,
      region,
      fencingToken,
      expiresAt: newLease.expiresAt,
    };
  }

  /**
   * Renews an existing active lease if the fencing token matches.
   */
  renewLease(
    resourceKey: string,
    holderNodeId: string,
    fencingToken: number,
    extensionMs = 5000,
  ): LeaseAcquisitionResult {
    const now = Date.now();
    const existing = this.leases.get(resourceKey);

    if (!existing) {
      return {
        resourceKey,
        acquired: false,
        holderNodeId,
        region: 'unknown',
        fencingToken,
        expiresAt: 0,
        reason: 'Lease does not exist or has been purged',
      };
    }

    if (
      existing.holderNodeId !== holderNodeId ||
      existing.fencingToken !== fencingToken
    ) {
      return {
        resourceKey,
        acquired: false,
        holderNodeId: existing.holderNodeId,
        region: existing.region,
        fencingToken: existing.fencingToken,
        expiresAt: existing.expiresAt,
        reason:
          'Fencing token or holder ID mismatch. Lease may have been reassigned.',
      };
    }

    existing.expiresAt = now + extensionMs;
    existing.renewCount++;

    return {
      resourceKey,
      acquired: true,
      holderNodeId,
      region: existing.region,
      fencingToken: existing.fencingToken,
      expiresAt: existing.expiresAt,
    };
  }

  /**
   * Releases an active lease cleanly.
   */
  releaseLease(
    resourceKey: string,
    holderNodeId: string,
    fencingToken: number,
  ): boolean {
    const existing = this.leases.get(resourceKey);
    if (!existing) return false;

    if (
      existing.holderNodeId === holderNodeId &&
      existing.fencingToken === fencingToken
    ) {
      this.leases.delete(resourceKey);
      this.logger.log(
        `🔓 [LEASE RELEASED] Resource '${resourceKey}' released cleanly by '${holderNodeId}'`,
      );
      return true;
    }
    return false;
  }

  /**
   * Validates if a fencing token is still the active, un-superseded leader for a resource.
   */
  validateFencingToken(resourceKey: string, fencingToken: number): boolean {
    const now = Date.now();
    const existing = this.leases.get(resourceKey);
    if (!existing) return false;
    return existing.fencingToken === fencingToken && existing.expiresAt > now;
  }

  getLease(resourceKey: string): LeaseRecord | undefined {
    return this.leases.get(resourceKey);
  }
}
