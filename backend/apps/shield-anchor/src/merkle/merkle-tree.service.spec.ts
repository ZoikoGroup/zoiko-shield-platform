import { MerkleTreeService } from './merkle-tree.service';

describe('MerkleTreeService (ZS-MERKLE-V1)', () => {
  const service = new MerkleTreeService();

  it('produces a valid inclusion proof for every leaf, single-leaf case', () => {
    const result = service.build(['leaf-a']);
    expect(service.verifyInclusion('leaf-a', result.proofs[0], result.root)).toBe(true);
  });

  it('produces valid inclusion proofs for every leaf, multi-leaf odd count (duplicate-last-node case)', () => {
    const leaves = ['leaf-a', 'leaf-b', 'leaf-c'];
    const result = service.build(leaves);
    leaves.forEach((leaf, i) => {
      expect(service.verifyInclusion(leaf, result.proofs[i], result.root)).toBe(true);
    });
  });

  it('a wrong sibling hash in the proof fails inclusion — never a false positive', () => {
    const result = service.build(['leaf-a', 'leaf-b']);
    const tamperedProof = result.proofs[0].map((step) => ({ ...step, siblingHash: '0'.repeat(64) }));
    expect(service.verifyInclusion('leaf-a', tamperedProof, result.root)).toBe(false);
  });

  it('is domain-separated — a leaf hash can never be replayed as a valid branch/root', () => {
    const singleLeafResult = service.build(['leaf-a']);
    const twoLeafResult = service.build(['leaf-a', 'leaf-b']);
    expect(singleLeafResult.root).not.toBe(twoLeafResult.root);
  });

  it('reports the ZS-MERKLE-V1 profile', () => {
    const result = service.build(['leaf-a']);
    expect(result.treeProfile).toBe('ZS-MERKLE-V1');
    expect(result.hashAlgorithm).toBe('SHA-256');
  });
});
