import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Notes are never mutated in place (spec §15). "Editing" a note creates a
 * new row with supersedes_id pointing at the original — the original
 * remains readable per retention policy.
 */
@Injectable()
export class CaseNoteService {
  constructor(private readonly prisma: PrismaService) {}

  async add(params: {
    tenantId: string;
    caseId: string;
    authorId: string;
    content: string;
    classification?: string;
  }) {
    return this.prisma.caseNote.create({
      data: {
        tenant_id: params.tenantId,
        case_id: params.caseId,
        author_id: params.authorId,
        content: params.content,
        classification: params.classification ?? 'INTERNAL',
      },
    });
  }

  async correct(params: {
    tenantId: string;
    caseId: string;
    authorId: string;
    content: string;
    supersedesId: string;
    classification?: string;
  }) {
    const original = await this.prisma.caseNote.findFirst({
      where: { id: params.supersedesId, tenant_id: params.tenantId },
    });
    if (!original) {
      throw new NotFoundException(
        `CaseNote '${params.supersedesId}' not found`,
      );
    }

    return this.prisma.caseNote.create({
      data: {
        tenant_id: params.tenantId,
        case_id: params.caseId,
        author_id: params.authorId,
        content: params.content,
        classification: params.classification ?? original.classification,
        supersedes_id: params.supersedesId,
      },
    });
  }

  async listForCase(tenantId: string, caseId: string) {
    return this.prisma.caseNote.findMany({
      where: { tenant_id: tenantId, case_id: caseId },
      orderBy: { created_at: 'asc' },
    });
  }
}
