/**
 * Quantum-Resistant Byzantine Fault-Tolerant (PQC-BFT) Consensus Simulator
 * 
 * Simulates:
 * 1. Initializing 4 multi-cloud sovereign anchor validator nodes (N = 3f + 1, f = 1).
 * 2. Executing 3-phase consensus round (Pre-Prepare, Prepare, Commit) with post-quantum multi-signatures.
 * 3. Committing sovereign Merkle epoch roots with finality and Byzantine fault resilience.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { PqcBftConsensusService } from '../apps/shield-anchor/src/consensus/pqc-bft-consensus.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Quantum-Resistant PQC-BFT State Consensus Simulator');
  console.log('    Specification: ZS-T0-TECH-001 §16 (Post-Quantum Byzantine Ledger State)');
  console.log('========================================================================\n');

  const bftService = new PqcBftConsensusService();
  const epochNumber = 882;
  const mockMerkleRoot = crypto.createHash('sha256').update(`EPOCH_MERKLE_ROOT_${epochNumber}`).digest('hex');

  console.log('[1/3] Inspecting Multi-Cloud Sovereign Validator Nodes...');
  const validators = bftService.getValidators();
  for (const v of validators) {
    console.log(`  ➔ Validator Node: [${v.nodeId}] | PQC Key: ${v.pqcPublicKeyHex} | Healthy: ${!v.isFaulty}`);
  }

  console.log('\n[2/3] Executing 3-Phase PQC-BFT Consensus Round for Epoch 882...');
  console.log(`  ➔ Candidate Merkle Root: 0x${mockMerkleRoot}`);

  const certificate = bftService.executeConsensusRound(epochNumber, mockMerkleRoot);

  console.log(`\n[3/3] BFT State Finality Certificate Issued:`);
  console.log(`  ✔ Certificate ID: ${certificate.certificateId}`);
  console.log(`  ✔ Epoch Number: ${certificate.epochNumber}`);
  console.log(`  ✔ Quorum Reached: ${certificate.quorumReached} (${certificate.participatingValidators.length}/${certificate.totalValidatorsN} nodes committed)`);
  console.log(`  ✔ Byzantine Fault Tolerance: f = ${certificate.faultToleranceF} faulty nodes tolerated`);
  console.log(`  ✔ Consensus Phase: ${certificate.consensusPhase}`);
  console.log(`  ✔ Committed Validator Signers: [${certificate.participatingValidators.join(', ')}]`);
  console.log(`  🔒 Aggregated PQC Multi-Signature Digest: ${certificate.aggregatedBftDigest}`);

  console.log('\n========================================================================');
  console.log(' 🎉 PQC-BFT CONSENSUS SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ PQC-BFT simulation failed:', err);
  process.exit(1);
});
