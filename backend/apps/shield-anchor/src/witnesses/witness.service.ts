import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WitnessProvider } from './witness-provider.interface';
import { MockWitnessProvider } from './mock-witness-provider.service';
import { HttpWitnessProvider } from './http-witness-provider.service';

export type WitnessAssuranceState = 'TEST_ONLY' | 'WITNESS_PARTIAL' | 'WITNESS_FULL';

/**
 * Development uses an explicitly marked mock witness. Production requires
 * signed receipts from at least two independently configured HTTP witnesses.
 */
@Injectable()
export class WitnessService {
  private readonly providers: WitnessProvider[];

  constructor(
    private readonly prisma: PrismaService,
    mockWitnessProvider: MockWitnessProvider,
    private readonly httpWitnessProvider: HttpWitnessProvider,
  ) {
    this.providers = [mockWitnessProvider];
  }

  async collectReceipts(checkpointId: string, merkleRoot: string) {
    const results = process.env.NODE_ENV === 'production'
      ? await this.httpWitnessProvider.attestAll(merkleRoot)
      : await Promise.all(this.providers.map((provider) => provider.attest(merkleRoot)));
    const receipts = [];
    for (const result of results) {
      const receipt = await this.prisma.witnessReceipt.create({
        data: {
          id: randomUUID(),
          checkpoint_id: checkpointId,
          witness_id: result.witnessId,
          witness_type: result.witnessType,
          receipt_hash: result.receiptHash,
          signature: result.signature,
          public_key: result.publicKey,
          algorithm: result.algorithm,
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
