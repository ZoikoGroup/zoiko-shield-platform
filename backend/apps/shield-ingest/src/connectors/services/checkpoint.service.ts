import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Single source of truth for connector checkpoints — previously duplicated
 * inline in both the sign-in poller and the user delta-sync service.
 * Provider cursors (delta links, page tokens, timestamps) are treated as
 * opaque strings; this service never interprets them.
 */
@Injectable()
export class ConnectorCheckpointService {
  constructor(private readonly prisma: PrismaService) {}

  async get(instanceId: string, resourceType: string): Promise<string | null> {
    const checkpoint = await this.prisma.connectorCheckpoint.findUnique({
      where: { instanceId_resourceType: { instanceId, resourceType } },
    });
    return checkpoint?.checkpointValue ?? null;
  }

  async set(tenantId: string, instanceId: string, resourceType: string, value: string): Promise<void> {
    await this.prisma.connectorCheckpoint.upsert({
      where: { instanceId_resourceType: { instanceId, resourceType } },
      update: { checkpointValue: value },
      create: {
        tenant_id: tenantId,
        instanceId,
        resourceType,
        checkpointValue: value,
      },
    });
  }
}
