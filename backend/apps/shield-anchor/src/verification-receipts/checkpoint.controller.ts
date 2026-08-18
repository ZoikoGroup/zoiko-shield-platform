import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from '../internal-client/internal-auth.guard';
import { CheckpointBuilderService } from '../checkpoint-builder/checkpoint-builder.service';

interface RequestCheckpointBody {
  tenantId: string;
  ledgerSequence: number;
  ledgerHeadHash: string;
  packageId?: string;
  packageVersion?: number;
  manifestCoreHash?: string;
}

/** shield-anchor's only inbound door — never reads shield-core's Prisma tables directly (spec §45). */
@Controller('internal/v1/checkpoints')
@UseGuards(InternalAuthGuard)
export class CheckpointController {
  constructor(
    private readonly checkpointBuilderService: CheckpointBuilderService,
  ) {}

  @Post()
  async requestCheckpoint(@Body() body: RequestCheckpointBody) {
    const proofEnvelope = await this.checkpointBuilderService.build(body);
    return { data: proofEnvelope };
  }
}
