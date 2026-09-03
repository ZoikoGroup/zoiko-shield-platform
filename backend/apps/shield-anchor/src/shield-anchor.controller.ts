import { Controller, Get, Post, Body, Param, NotFoundException, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from './internal-client/internal-auth.guard';
import {
  BatchMerkleCheckpointerService,
  type EvidenceLeaf,
  type MerkleInclusionProof,
} from './merkle/batch-merkle-checkpointer.service';

export class EvidenceLeafDto implements EvidenceLeaf {
  evidenceId!: string;
  tenantId!: string;
  eventType!: string;
  payloadDigest!: string;
  timestamp!: string;
}

export class SealEpochBatchDto {
  items!: EvidenceLeafDto[];
}

export class VerifyProofDto implements MerkleInclusionProof {
  leafHash!: string;
  leafIndex!: number;
  auditPath!: Array<{ position: 'left' | 'right'; hash: string }>;
  merkleRoot!: string;
  epochNumber!: number;
}

@UseGuards(InternalAuthGuard)
@Controller()
export class ShieldAnchorController {
  constructor(
    private readonly checkpointerService: BatchMerkleCheckpointerService,
  ) {}

  @Get()
  getHello(): string {
    return 'shield-anchor online';
  }

  @Get('health')
  getHealth() {
    return {
      status: 'healthy',
      service: 'shield-anchor',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/ready')
  getHealthReady() {
    return {
      status: 'ready',
      service: 'shield-anchor',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/live')
  getHealthLive() {
    return {
      status: 'live',
      service: 'shield-anchor',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('api/v1/anchor/batches/seal')
  sealEpochBatch(@Body() body: SealEpochBatchDto) {
    return this.checkpointerService.buildEpochCheckpoint(body.items);
  }

  @Post('api/v1/anchor/proofs/verify')
  verifyProof(@Body() body: VerifyProofDto) {
    const valid = this.checkpointerService.verifyInclusionProof(body);
    return { valid, epochNumber: body.epochNumber, verifiedAt: new Date().toISOString() };
  }

  @Get('api/v1/anchor/receipts/:epochNumber')
  getReceipt(@Param('epochNumber') epochNumber: string) {
    const epochNum = parseInt(epochNumber, 10);
    const checkpoint = this.checkpointerService.getEpochCheckpoint(epochNum);
    if (!checkpoint) {
      throw new NotFoundException(`Checkpoint for epoch #${epochNumber} not found`);
    }
    return checkpoint;
  }

  @Get('api/v1/anchor/proofs/:epochNumber/:leafIndex')
  getInclusionProof(
    @Param('epochNumber') epochNumber: string,
    @Param('leafIndex') leafIndex: string,
  ) {
    const epochNum = parseInt(epochNumber, 10);
    const index = parseInt(leafIndex, 10);
    return this.checkpointerService.generateInclusionProof(epochNum, index);
  }
}
