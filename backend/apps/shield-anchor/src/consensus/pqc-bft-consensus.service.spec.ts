import { PqcBftConsensusService } from './pqc-bft-consensus.service';

describe('PqcBftConsensusService', () => {
  let bftService: PqcBftConsensusService;

  beforeEach(() => {
    bftService = new PqcBftConsensusService();
  });

  it('should execute 3-phase consensus round and emit finality certificate with 2f+1 quorum', () => {
    const epochNumber = 104;
    const merkleRoot =
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    const cert = bftService.executeConsensusRound(epochNumber, merkleRoot);

    expect(cert.certificateId).toBeDefined();
    expect(cert.epochNumber).toBe(104);
    expect(cert.merkleRootHex).toBe(merkleRoot);
    expect(cert.quorumReached).toBe(true);
    expect(cert.participatingValidators.length).toBeGreaterThanOrEqual(3);
    expect(cert.consensusPhase).toBe('FINALIZED');
    expect(cert.aggregatedBftDigest).toBeDefined();
  });

  it('should succeed even with f=1 faulty validator node', () => {
    const validators = bftService.getValidators();
    validators[3].isFaulty = true; // Mark node 4 as faulty

    const cert = bftService.executeConsensusRound(
      105,
      '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
    );
    expect(cert.quorumReached).toBe(true);
    expect(cert.participatingValidators.length).toBe(3); // 3 out of 4 nodes voted
  });
});
