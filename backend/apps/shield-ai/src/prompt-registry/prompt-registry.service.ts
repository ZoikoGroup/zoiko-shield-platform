import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Versioned, immutable-once-published (spec §6) — same DetectionVersion-style precedent already established. */
@Injectable()
export class PromptRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  async createDraft(data: {
    key: string;
    version: number;
    systemPromptRef: string;
    outputSchema: Record<string, unknown>;
  }) {
    return this.prisma.promptProfile.create({
      data: {
        key: data.key,
        version: data.version,
        system_prompt_ref: data.systemPromptRef,
        output_schema: JSON.stringify(data.outputSchema),
        status: 'DRAFT',
      },
    });
  }

  async publish(id: string) {
    const prompt = await this.prisma.promptProfile.findUniqueOrThrow({
      where: { id },
    });
    if (prompt.status === 'PUBLISHED') {
      throw new ConflictException(
        `PromptProfile '${id}' is already PUBLISHED and cannot be republished`,
      );
    }
    return this.prisma.promptProfile.update({
      where: { id },
      data: { status: 'PUBLISHED', published_at: new Date() },
    });
  }

  async getActiveForKey(key: string) {
    const prompt = await this.prisma.promptProfile.findFirst({
      where: { key, status: 'PUBLISHED' },
      orderBy: { version: 'desc' },
    });
    if (!prompt) {
      throw new NotFoundException(
        `No PUBLISHED PromptProfile for key '${key}'`,
      );
    }
    return prompt;
  }
}
