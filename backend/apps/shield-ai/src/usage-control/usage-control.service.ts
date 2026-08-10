import { Injectable } from '@nestjs/common';

const WINDOW_MS = 60 * 60 * 1000; // 1h
const DEFAULT_MAX_REQUESTS_PER_WINDOW = 100;

/**
 * Per-tenant budget counter. In-memory for this MVP (resets on restart) —
 * still a real check, not a stub that always allows; a persisted version
 * is a drop-in swap of the storage layer only.
 */
@Injectable()
export class UsageControlService {
  private readonly counters = new Map<string, { count: number; windowStart: number }>();

  checkAndIncrement(tenantId: string, max = DEFAULT_MAX_REQUESTS_PER_WINDOW): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const entry = this.counters.get(tenantId);

    if (!entry || now - entry.windowStart > WINDOW_MS) {
      this.counters.set(tenantId, { count: 1, windowStart: now });
      return { allowed: true, remaining: max - 1 };
    }

    if (entry.count >= max) {
      return { allowed: false, remaining: 0 };
    }

    entry.count += 1;
    return { allowed: true, remaining: max - entry.count };
  }
}
