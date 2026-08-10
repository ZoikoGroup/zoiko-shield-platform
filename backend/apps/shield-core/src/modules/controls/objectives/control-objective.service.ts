import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CreateControlObjectiveInput {
  key: string;
  title: string;
  description: string;
  category: string;
  owner: string;
  version?: string;
}

/** WHAT must be achieved — not how any one tenant implements it (spec §5). */
@Injectable()
export class ControlObjectiveService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateControlObjectiveInput) {
    return this.prisma.controlObjective.create({
      data: {
        id: randomUUID(),
        key: input.key,
        title: input.title,
        description: input.description,
        category: input.category,
        owner: input.owner,
        version: input.version ?? '1.0',
        status: 'ACTIVE',
      },
    });
  }

  async getById(controlObjectiveId: string) {
    const objective = await this.prisma.controlObjective.findUnique({ where: { id: controlObjectiveId } });
    if (!objective) {
      throw new NotFoundException(`ControlObjective '${controlObjectiveId}' not found`);
    }
    return objective;
  }

  async list() {
    return this.prisma.controlObjective.findMany({ orderBy: { created_at: 'asc' } });
  }
}
