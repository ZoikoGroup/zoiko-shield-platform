import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentHashService } from '../../evidence/hashing/content-hash.service';

export interface CreateFrameworkInput {
  key: string;
  name: string;
  version: string;
  edition?: string;
  publisher?: string;
  effectiveFrom?: Date;
}

export interface CreateFrameworkVersionInput {
  frameworkId: string;
  version: string;
  effectiveFrom: Date;
  content: Record<string, unknown>;
}

/**
 * Frameworks are content/configuration, never framework-specific
 * application logic (spec §2). Published FrameworkVersions are immutable
 * from then on — same publish-once convention as DetectionRegistryService.
 */
@Injectable()
export class FrameworkRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: ContentHashService,
  ) {}

  async createFramework(input: CreateFrameworkInput) {
    return this.prisma.framework.create({
      data: {
        id: randomUUID(),
        key: input.key,
        name: input.name,
        version: input.version,
        edition: input.edition,
        publisher: input.publisher,
        status: 'ACTIVE',
        effective_from: input.effectiveFrom,
      },
    });
  }

  async createVersion(input: CreateFrameworkVersionInput) {
    const { contentHash } = this.hashService.hashCanonicalJson(input.content);
    return this.prisma.frameworkVersion.create({
      data: {
        id: randomUUID(),
        framework_id: input.frameworkId,
        version: input.version,
        effective_from: input.effectiveFrom,
        content_hash: contentHash,
        status: 'DRAFT',
      },
    });
  }

  async publishVersion(frameworkVersionId: string) {
    const version = await this.prisma.frameworkVersion.findUniqueOrThrow({ where: { id: frameworkVersionId } });
    if (version.status === 'PUBLISHED') {
      throw new ConflictException(`FrameworkVersion '${frameworkVersionId}' is already PUBLISHED and cannot be republished`);
    }
    return this.prisma.frameworkVersion.update({
      where: { id: frameworkVersionId },
      data: { status: 'PUBLISHED' },
    });
  }

  async getPublishedVersion(frameworkVersionId: string) {
    const version = await this.prisma.frameworkVersion.findUnique({ where: { id: frameworkVersionId } });
    if (!version) {
      throw new NotFoundException(`FrameworkVersion '${frameworkVersionId}' not found`);
    }
    return version;
  }
}
