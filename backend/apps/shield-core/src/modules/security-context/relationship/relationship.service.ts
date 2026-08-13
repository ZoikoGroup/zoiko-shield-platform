import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { requireEnvironmentId } from '../../../tenant-context';

export interface UpsertRelationshipInput {
  tenantId: string;
  environmentId?: string;
  subjectType: string;
  subjectId: string;
  relation: string;
  objectType: string;
  objectId: string;
  source: string;
  confidence?: number;
  observedAt?: Date;
}

/**
 * Explicit relationships between canonical entities (spec §7), always
 * carrying provenance (`source`). Upserts on the natural key so repeated
 * observations (e.g. the same user signing into the same device again)
 * update recency instead of creating duplicate rows.
 */
@Injectable()
export class RelationshipService {
  private readonly logger = new Logger(RelationshipService.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsert(input: UpsertRelationshipInput) {
    const observedAt = input.observedAt ?? new Date();
    const environmentId = requireEnvironmentId(input.environmentId);

    const key = {
      tenant_id: input.tenantId,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      relation: input.relation,
      object_type: input.objectType,
      object_id: input.objectId,
    };

    return this.prisma.relationship.upsert({
      where: {
        tenant_id_subject_type_subject_id_relation_object_type_object_id: key as any,
      },
      update: { last_seen_at: observedAt },
      create: {
        ...key,
        environment_id: environmentId,
        source: input.source,
        confidence: input.confidence ?? 1.0,
        first_seen_at: observedAt,
        last_seen_at: observedAt,
      },
    });
  }
}
