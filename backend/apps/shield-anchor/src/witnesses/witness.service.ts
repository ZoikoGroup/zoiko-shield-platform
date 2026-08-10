import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WitnessProvider } from './witness-provider.interface';
import { MockWitnessProvider } from './mock-witness-provider.service';

export type WitnessAssuranceState = 'TEST_ONLY' | 'WITNESS_PARTIAL' | 'WITNESS_FULL';

/**
 * Only MockWitnessProvider is registered this pass, so witnessAssuranceState
 * can only ever resolve to TEST_ONLY — WITNESS_PARTIAL (1 real witness)
 * and WITNESS_FULL (2+ independently-operated real witnesses) are modeled
 * but structurally unreachable until a real provider exists (spec
 * correction #3).
 */
@Injectable()
export class WitnessService {
  private readonly providers: WitnessProvider[];

  constructor(
    private readonly prisma: PrismaService,
    mockWitnessProvider: MockWitnessProvider,
  ) {
    this.providers = [mockWitnessProvider];
  }

  async collectReceipts(checkpointId: string, merkleRoot: string) {
    const receipts = [];
    for (const provider of this.providers) {
      const result = await provider.attest(merkleRoot);
      const receipt = await this.prisma.witnessReceipt.create({
        data: {
          id: randomUUID(),
          checkpoint_id: checkpointId,
          witness_id: result.witnessId,
          witness_type: result.witnessType,
          receipt_hash: result.receiptHash,
          status: 'RECEIVED',
        },
      });
      receipts.push(receipt);
    }
    return { receipts, witnessAssuranceState: this.computeAssuranceState(receipts.map((r) => r.witness_type)) };
  }

  private computeAssuranceState(witnessTypes: string[]): WitnessAssuranceState {
    const realWitnesses = witnessTypes.filter((t) => t !== 'MOCK');
    if (realWitnesses.length >= 2) return 'WITNESS_FULL';
    if (realWitnesses.length === 1) return 'WITNESS_PARTIAL';
    return 'TEST_ONLY';
  }
}
