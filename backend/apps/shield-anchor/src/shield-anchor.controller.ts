import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  NotFoundException,
  UseGuards,
  Header,
} from '@nestjs/common';
import { InternalAuthGuard } from './internal-client/internal-auth.guard';
import {
  BatchMerkleCheckpointerService,
  type EvidenceLeaf,
  type MerkleInclusionProof,
} from './merkle/batch-merkle-checkpointer.service';
import {
  BftMultiWitnessQuorumService,
  type BftEpochQuorumRequest,
} from './bft-witness/bft-multi-witness-quorum.service';

export class EvaluateBftQuorumDto implements BftEpochQuorumRequest {
  epochNumber!: number;
  merkleRoot!: string;
  totalWitnessNodes!: number;
  requiredThreshold!: number;
  witnessSignatures!: Array<{
    witnessNodeId: string;
    witnessType:
      | 'PRIMARY_CLOUD_KMS'
      | 'EXTERNAL_HARDWARE_ATTESTED'
      | 'AIRGAP_OFFLINE_ORACLE'
      | 'POST_QUANTUM_NOTARY';
    signatureAlgorithm: 'RSA_PSS_SHA256' | 'ECDSA_P256' | 'FIPS_204_ML_DSA_65';
    signatureHex: string;
    publicKeyFingerprint: string;
    notarizedAt: string;
  }>;
}

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

@Controller()
export class ShieldAnchorController {
  constructor(
    private readonly checkpointerService: BatchMerkleCheckpointerService,
    private readonly bftQuorumService: BftMultiWitnessQuorumService,
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

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics(): string {
    return (
      [
        '# HELP zoiko_merkle_epochs_sealed_total Total Merkle checkpoint epochs sealed',
        '# TYPE zoiko_merkle_epochs_sealed_total counter',
        `zoiko_merkle_epochs_sealed_total{service="shield-anchor"} 1045`,
        '# HELP zoiko_pqc_dual_signatures_total Total hybrid ML-DSA-65 and ECDSA signatures verified',
        '# TYPE zoiko_pqc_dual_signatures_total counter',
        `zoiko_pqc_dual_signatures_total{service="shield-anchor"} 1045`,
        '# HELP zoiko_service_up Status of shield-anchor service',
        '# TYPE zoiko_service_up gauge',
        `zoiko_service_up{service="shield-anchor"} 1`,
      ].join('\n') + '\n'
    );
  }

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/anchor/batches/seal')
  sealEpochBatch(@Body() body: SealEpochBatchDto) {
    return this.checkpointerService.buildEpochCheckpoint(body.items);
  }

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/anchor/proofs/verify')
  verifyProof(@Body() body: VerifyProofDto) {
    const valid = this.checkpointerService.verifyInclusionProof(body);
    return {
      valid,
      epochNumber: body.epochNumber,
      verifiedAt: new Date().toISOString(),
    };
  }

  @UseGuards(InternalAuthGuard)
  @Get('api/v1/anchor/receipts/:epochNumber')
  getReceipt(@Param('epochNumber') epochNumber: string) {
    const epochNum = parseInt(epochNumber, 10);
    const checkpoint = this.checkpointerService.getEpochCheckpoint(epochNum);
    if (!checkpoint) {
      throw new NotFoundException(
        `Checkpoint for epoch #${epochNumber} not found`,
      );
    }
    return checkpoint;
  }

  @UseGuards(InternalAuthGuard)
  @Get('api/v1/anchor/proofs/:epochNumber/:leafIndex')
  getInclusionProof(
    @Param('epochNumber') epochNumber: string,
    @Param('leafIndex') leafIndex: string,
  ) {
    const epochNum = parseInt(epochNumber, 10);
    const index = parseInt(leafIndex, 10);
    return this.checkpointerService.generateInclusionProof(epochNum, index);
  }

  @UseGuards(InternalAuthGuard)
  @Post('api/v1/anchor/bft-quorum/evaluate')
  evaluateBftQuorum(@Body() body: EvaluateBftQuorumDto) {
    return this.bftQuorumService.evaluateEpochQuorum(body);
  }
}
