import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';

export class CreateResourceDefinitionDto {
  @IsString()
  resourceType!: string;

  @IsArray()
  identityKeys!: string[];

  @IsOptional()
  @IsObject()
  ephemeralPolicy?: Record<string, unknown>;
}

/**
 * ZS-COM-BILL-001 Part 6: identity/dedup rules for a resource class must be
 * an approved, versioned definition — never inferred ad hoc per observation.
 */
@Injectable()
export class ProtectedResourceDefinitionService {
  private readonly logger = new Logger(ProtectedResourceDefinitionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createDefinition(dto: CreateResourceDefinitionDto) {
    const latest = await this.prisma.protectedResourceDefinition.findFirst({
      where: { resource_type: dto.resourceType },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;

    return this.prisma.protectedResourceDefinition.create({
      data: {
        resource_type: dto.resourceType,
        version,
        identity_key_spec: JSON.stringify({ keys: dto.identityKeys }),
        ephemeral_policy: JSON.stringify(dto.ephemeralPolicy ?? {}),
        status: 'DRAFT',
      },
    });
  }

  async approveDefinition(id: string, approvedBy: string) {
    const definition = await this.prisma.protectedResourceDefinition.findUnique(
      { where: { id } },
    );
    if (!definition) {
      throw new NotFoundException(`Resource definition '${id}' not found`);
    }
    if (definition.status !== 'DRAFT') {
      throw new ConflictException(
        `Resource definition '${id}' is '${definition.status}', not DRAFT`,
      );
    }

    return this.prisma.protectedResourceDefinition.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approved_by: approvedBy,
        approved_at: new Date(),
      },
    });
  }

  /**
   * Fail-closed: no approved definition for a resource type means no
   * observation of that type can be identified/deduped/covered yet.
   */
  async getActiveDefinition(resourceType: string) {
    const definition = await this.prisma.protectedResourceDefinition.findFirst({
      where: { resource_type: resourceType, status: 'APPROVED' },
      orderBy: { version: 'desc' },
    });

    if (!definition) {
      this.logger.warn(
        `Resource definition query FAILED CLOSED for type '${resourceType}'`,
      );
      return null;
    }

    return definition;
  }
}
