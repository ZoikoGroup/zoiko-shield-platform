import {
  Injectable,
  Logger,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';

export interface LockAcquireInput {
  tenantId: string;
  actionType: string;
  targetResource: string;
  idempotencyKey: string;
  ownerId: string;
  ttlSeconds?: number;
}

export interface DistributedLockRecord {
  lockKey: string;
  lockToken: string;
  tenantId: string;
  actionType: string;
  targetResource: string;
  idempotencyKey: string;
  ownerId: string;
  acquiredAt: string;
  expiresAt: string;
}

export interface LockAcquireResult {
  acquired: boolean;
  lockToken: string;
  lockKey: string;
  status: 'ACQUIRED' | 'ACQUIRED_IDEMPOTENT' | 'CONFLICT_LOCKED';
  expiresAt: string;
  ownerId: string;
}

/**
 * Distributed Action Lock & Concurrency Control Service
 * Prevents race conditions, duplicate executions, and contradictory remediation actions on target infrastructure.
 * Governed by ZS-ENG-INT-001 & ZS-T0-TECH-001 §6.
 */
@Injectable()
export class DistributedActionLockService {
  private readonly logger = new Logger(DistributedActionLockService.name);

  // In-memory distributed lock table (Redis/Memory abstraction)
  private readonly lockTable = new Map<string, DistributedLockRecord>();

  /**
   * Generates a normalized lock key.
   */
  private buildLockKey(
    tenantId: string,
    actionType: string,
    targetResource: string,
  ): string {
    return `${tenantId}:${actionType.toUpperCase()}:${targetResource.toLowerCase()}`;
  }

  /**
   * Attempts to acquire an exclusive lock on an asset for a specific action type.
   */
  acquireLock(input: LockAcquireInput): LockAcquireResult {
    if (
      !input.tenantId ||
      !input.actionType ||
      !input.targetResource ||
      !input.idempotencyKey ||
      !input.ownerId
    ) {
      throw new BadRequestException(
        'Missing mandatory lock parameters: tenantId, actionType, targetResource, idempotencyKey, and ownerId are required.',
      );
    }

    const lockKey = this.buildLockKey(
      input.tenantId,
      input.actionType,
      input.targetResource,
    );
    const now = Date.now();
    const ttlSeconds = input.ttlSeconds ?? 60;
    const existingLock = this.lockTable.get(lockKey);

    // Check if an existing unexpired lock exists
    if (existingLock && new Date(existingLock.expiresAt).getTime() > now) {
      // Idempotency check: Same idempotency key and owner allows re-entry
      if (
        existingLock.idempotencyKey === input.idempotencyKey &&
        existingLock.ownerId === input.ownerId
      ) {
        this.logger.log(
          `✔ [IDEMPOTENT RE-ENTRY] Lock '${lockKey}' re-acquired by owner '${input.ownerId}' with key '${input.idempotencyKey}'`,
        );
        return {
          acquired: true,
          lockToken: existingLock.lockToken,
          lockKey,
          status: 'ACQUIRED_IDEMPOTENT',
          expiresAt: existingLock.expiresAt,
          ownerId: existingLock.ownerId,
        };
      }

      // Otherwise, conflict
      this.logger.warn(
        `🛑 [LOCK CONFLICT] Target '${input.targetResource}' is currently locked by '${existingLock.ownerId}' until ${existingLock.expiresAt}.`,
      );
      throw new ConflictException(
        `Action Concurrency Conflict: Resource '${input.targetResource}' is already locked for action '${input.actionType}' by '${existingLock.ownerId}'.`,
      );
    }

    // Grant new lock
    const lockToken = `lock-tok-${crypto.randomUUID()}`;
    const acquiredAt = new Date(now).toISOString();
    const expiresAt = new Date(now + ttlSeconds * 1000).toISOString();

    const record: DistributedLockRecord = {
      lockKey,
      lockToken,
      tenantId: input.tenantId,
      actionType: input.actionType,
      targetResource: input.targetResource,
      idempotencyKey: input.idempotencyKey,
      ownerId: input.ownerId,
      acquiredAt,
      expiresAt,
    };

    this.lockTable.set(lockKey, record);

    this.logger.log(
      `✔ [LOCK ACQUIRED] Asset '${input.targetResource}' locked for '${input.actionType}' by '${input.ownerId}' (TTL: ${ttlSeconds}s)`,
    );

    return {
      acquired: true,
      lockToken,
      lockKey,
      status: 'ACQUIRED',
      expiresAt,
      ownerId: input.ownerId,
    };
  }

  /**
   * Releases an exclusive lock given the matching lockToken.
   */
  releaseLock(
    tenantId: string,
    actionType: string,
    targetResource: string,
    lockToken: string,
  ): boolean {
    const lockKey = this.buildLockKey(tenantId, actionType, targetResource);
    const existingLock = this.lockTable.get(lockKey);

    if (!existingLock) {
      return true; // Already released or expired
    }

    if (existingLock.lockToken !== lockToken) {
      this.logger.warn(
        `🛑 [LOCK RELEASE REJECTED] Provided lockToken '${lockToken}' does not match active token for '${lockKey}'.`,
      );
      return false;
    }

    this.lockTable.delete(lockKey);
    this.logger.log(`✔ [LOCK RELEASED] Lock '${lockKey}' released.`);
    return true;
  }

  /**
   * Extends the TTL of an active lock via a heartbeat signal.
   */
  renewLockHeartbeat(
    tenantId: string,
    actionType: string,
    targetResource: string,
    lockToken: string,
    extensionSeconds: number = 60,
  ): boolean {
    const lockKey = this.buildLockKey(tenantId, actionType, targetResource);
    const existingLock = this.lockTable.get(lockKey);

    if (!existingLock) {
      return false;
    }

    if (existingLock.lockToken !== lockToken) {
      return false;
    }

    const now = Date.now();
    existingLock.expiresAt = new Date(now + extensionSeconds * 1000).toISOString();
    this.logger.log(
      `✔ [LOCK HEARTBEAT EXTENDED] Lock '${lockKey}' extended by ${extensionSeconds}s.`,
    );
    return true;
  }

  /**
   * Inspects whether a specific resource is locked.
   */
  isResourceLocked(
    tenantId: string,
    actionType: string,
    targetResource: string,
  ): { locked: boolean; ownerId?: string; expiresAt?: string } {
    const lockKey = this.buildLockKey(tenantId, actionType, targetResource);
    const existingLock = this.lockTable.get(lockKey);

    if (!existingLock) {
      return { locked: false };
    }

    if (new Date(existingLock.expiresAt).getTime() <= Date.now()) {
      this.lockTable.delete(lockKey);
      return { locked: false };
    }

    return {
      locked: true,
      ownerId: existingLock.ownerId,
      expiresAt: existingLock.expiresAt,
    };
  }
}
