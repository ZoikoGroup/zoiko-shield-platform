import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ConnectorActivityEvent {
  id: string;
  receivedAt: string;
  /** ACCEPTED (stored, not yet understood), NORMALIZED (stored and understood), QUARANTINED (stored, rejected). */
  status: string;
  activity: string | null;
  category: string | null;
  severity: string | null;
  outcome: string | null;
  actor: string | null;
  resource: string | null;
  resourceType: string | null;
  /** A few safe fields lifted from the payload (for example the branch of a push). */
  details: Record<string, string | number> | null;
}

export interface ConnectorActivity {
  total: number;
  last24h: number;
  lastReceivedAt: string | null;
  events: ConnectorActivityEvent[];
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const DETAIL_MAX_LENGTH = 120;

const clip = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0
    ? value.replace(/\s+/g, ' ').slice(0, DETAIL_MAX_LENGTH)
    : null;

/**
 * A few identifying fields from a delivery's payload, for showing what happened at a
 * glance. Deliberately a short allow-list: the payload itself is never returned (it can
 * hold anything the sender put in it), and every value is clipped.
 */
export function summarizePayload(
  raw: string | null | undefined,
): Record<string, string | number> | null {
  let payload: any;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const out: Record<string, string | number> = {};
  const set = (key: string, value: string | number | null) => {
    if (value !== null && value !== undefined) out[key] = value;
  };
  set('ref', clip(payload.ref));
  set('branch', clip(payload.ref)?.replace(/^refs\/heads\//, '') ?? null);
  set('repository', clip(payload.repository?.full_name));
  set('sender', clip(payload.sender?.login));
  if (Array.isArray(payload.commits)) set('commits', payload.commits.length);
  // First line only, taken before whitespace is collapsed (a commit body is not a title).
  const message = payload.head_commit?.message;
  set('message', typeof message === 'string' ? clip(message.split('\n')[0]) : null);
  set('eventType', clip(payload.eventType));
  set('action', clip(payload.action));
  delete out.ref; // `branch` is the readable form of it
  return Object.keys(out).length > 0 ? out : null;
}

@Injectable()
export class ConnectorActivityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * What a connector has received: totals and its most recent deliveries, each joined to
   * what it was understood as. Everything is scoped to the caller's tenant.
   */
  async recent(
    tenantId: string,
    connectorId: string,
    limit = DEFAULT_LIMIT,
  ): Promise<ConnectorActivity> {
    const connector = await this.prisma.connectorInstance.findFirst({
      where: { id: connectorId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!connector) throw new NotFoundException('Connector not found');

    const take = Number.isFinite(limit)
      ? Math.min(Math.max(Math.floor(limit), 1), MAX_LIMIT)
      : DEFAULT_LIMIT;
    const where = { tenant_id: tenantId, connector_id: connectorId };

    const [total, last24h, rows] = await Promise.all([
      this.prisma.rawEvent.count({ where }),
      this.prisma.rawEvent.count({
        where: {
          ...where,
          received_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.rawEvent.findMany({
        where,
        orderBy: { received_at: 'desc' },
        take,
        select: {
          id: true,
          received_at: true,
          processing_status: true,
          raw_payload_reference: true,
        },
      }),
    ]);

    const normalized = rows.length
      ? await this.prisma.normalizedEvent.findMany({
          where: { tenant_id: tenantId, raw_event_id: { in: rows.map((r) => r.id) } },
          select: {
            raw_event_id: true,
            event_activity: true,
            event_category: true,
            event_class: true,
            severity: true,
            outcome: true,
            actor_user_id: true,
            resource_id: true,
            resource_type: true,
          },
        })
      : [];
    const byRaw = new Map(normalized.map((n) => [n.raw_event_id, n]));

    return {
      total,
      last24h,
      lastReceivedAt: rows[0]?.received_at.toISOString() ?? null,
      events: rows.map((row) => {
        const n = byRaw.get(row.id);
        return {
          id: row.id,
          receivedAt: row.received_at.toISOString(),
          status: row.processing_status,
          activity: n?.event_activity ?? n?.event_class ?? null,
          category: n?.event_category ?? null,
          severity: n?.severity ?? null,
          outcome: n?.outcome ?? null,
          actor: n?.actor_user_id ?? null,
          resource: n?.resource_id ?? null,
          resourceType: n?.resource_type ?? null,
          details: summarizePayload(row.raw_payload_reference),
        };
      }),
    };
  }
}
