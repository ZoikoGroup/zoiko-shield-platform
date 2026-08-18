import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DeduplicationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the existing RawEvent if this (tenant, connector, sourceEventId) was already ingested. */
  async findExisting(
    tenantId: string,
    connectorId: string,
    sourceEventId: string,
  ) {
    return this.prisma.rawEvent.findFirst({
      where: {
        tenant_id: tenantId,
        connector_id: connectorId,
        source_event_id: sourceEventId,
      },
    });
  }
}
