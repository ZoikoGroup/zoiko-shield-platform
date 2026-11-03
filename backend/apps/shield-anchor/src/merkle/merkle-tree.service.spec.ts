import {
  MerkleTreeService,
  TREE_PROFILE_V1,
  TREE_PROFILE_V2,
} from './merkle-tree.service';

// Certificate Transparency reference vectors (RFC 6962 MTH over these 8 leaves).
const CT_LEAVES = [
  '',
  '\x00',
  '\x10',
  '\x20\x21',
  '\x30\x31',
  '\x40\x41\x42\x43',
  '\x50\x51\x52\x53\x54\x55\x56\x57',
  '\x60\x61\x62\x63\x64\x65\x66\x67\x68\x69\x6a\x6b\x6c\x6d\x6e\x6f',
];
const CT_ROOTS = [
  '6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d',
  'fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125',
  'aeb6bcfe274b70a14fb067a5e5578264db0fa9b51af5e0ba159158f329e06e77',
  'd37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7',
  '4e3bbb1f7b478dcfe71fb631631519a3bca12c9aefca1612bfce4c13a86264d4',
  '76e67dadbcdf1e10e1b74ddc608abd2f98dfb16fbce75277b5232a127f2087ef',
  'ddb89be403809e325750d3d263cd78929c2942b7942a34b77e122c9594a74c8c',
  '5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328',
];

const leavesOf = (n: number) =>
  Array.from({ length: n }, (_, i) => `leaf-${i}`);

describe('MerkleTreeService', () => {
  const service = new MerkleTreeService();

  describe('ZS-MERKLE-V2 (RFC 6962)', () => {
    it('matches the Certificate Transparency reference roots for sizes 1..8', () => {
      CT_ROOTS.forEach((expected, i) => {
        expect(service.computeRoot(CT_LEAVES.slice(0, i + 1))).toBe(expected);
      });
    });

    it('produces a valid inclusion proof for every leaf at every size 1..33', () => {
      for (let n = 1; n <= 33; n++) {
        const leaves = leavesOf(n);
        const result = service.build(leaves);
        leaves.forEach((leaf, i) => {
          expect(
            service.verifyInclusion(leaf, result.proofs[i], result.root),
          ).toBe(true);
        });
      }
    });

    it('does not let a duplicated trailing leaf collide with the original tree', () => {
      const original = service.computeRoot(['a', 'b', 'c']);
      const padded = service.computeRoot(['a', 'b', 'c', 'c']);
      expect(original).not.toBe(padded);
    });

    it('a wrong sibling hash in the proof fails inclusion — never a false positive', () => {
      const result = service.build(['leaf-a', 'leaf-b', 'leaf-c']);
      const tamperedProof = result.proofs[0].map((step) => ({
        ...step,
        siblingHash: '0'.repeat(64),
      }));
      expect(
        service.verifyInclusion('leaf-a', tamperedProof, result.root),
      ).toBe(false);
    });

    it('a mutated leaf fails inclusion', () => {
      const result = service.build(leavesOf(5));
      expect(
        service.verifyInclusion('leaf-X', result.proofs[2], result.root),
      ).toBe(false);
    });

    it('is domain-separated — a leaf hash can never be replayed as a valid branch/root', () => {
      expect(service.computeRoot(['leaf-a'])).not.toBe(
        service.computeRoot(['leaf-a', 'leaf-b']),
      );
    });

    it('reports the ZS-MERKLE-V2 profile by default', () => {
      const result = service.build(['leaf-a']);
      expect(result.treeProfile).toBe(TREE_PROFILE_V2);
      expect(result.hashAlgorithm).toBe('SHA-256');
    });

    it('rejects an unknown profile', () => {
      expect(() => service.build(['a'], 'ZS-MERKLE-V9' as any)).toThrow(
        /unsupported tree profile/,
      );
    });
  });

  describe('consistency proofs', () => {
    it('verifies for every prefix size m <= n for n up to 33', () => {
      for (let n = 1; n <= 33; n++) {
        const leaves = leavesOf(n);
        const newRoot = service.computeRoot(leaves);
        for (let m = 1; m <= n; m++) {
          const oldRoot = service.computeRoot(leaves.slice(0, m));
          const proof = service.consistencyProof(m, leaves);
          expect(service.verifyConsistency(m, n, oldRoot, newRoot, proof)).toBe(
            true,
          );
        }
      }
    });

    it('fails when the old tree was rewritten rather than appended to', () => {
      const leaves = leavesOf(7);
      const forkedOld = service.computeRoot(['leaf-0', 'leaf-1', 'EVIL']);
      const proof = service.consistencyProof(3, leaves);
      expect(
        service.verifyConsistency(
          3,
          7,
          forkedOld,
          service.computeRoot(leaves),
          proof,
        ),
      ).toBe(false);
    });

    it('fails on a tampered proof node, wrong sizes, or a reversed size order', () => {
      const leaves = leavesOf(11);
      const oldRoot = service.computeRoot(leaves.slice(0, 6));
      const newRoot = service.computeRoot(leaves);
      const proof = service.consistencyProof(6, leaves);
      const tampered = [...proof];
      tampered[0] = '0'.repeat(64);

      expect(service.verifyConsistency(6, 11, oldRoot, newRoot, tampered)).toBe(
        false,
      );
      expect(service.verifyConsistency(5, 11, oldRoot, newRoot, proof)).toBe(
        false,
      );
      // RFC 9162 does not bind every size bit (6→11 and 6→12 share a path shape);
      // sizes are bound by the signed checkpoint, so only test a structural mismatch.
      expect(service.verifyConsistency(6, 20, oldRoot, newRoot, proof)).toBe(
        false,
      );
      expect(service.verifyConsistency(11, 6, newRoot, oldRoot, proof)).toBe(
        false,
      );
      expect(service.verifyConsistency(0, 11, oldRoot, newRoot, proof)).toBe(
        false,
      );
    });

    it('equal sizes require an empty proof and identical roots', () => {
      const root = service.computeRoot(leavesOf(4));
      expect(service.verifyConsistency(4, 4, root, root, [])).toBe(true);
      expect(service.verifyConsistency(4, 4, root, root, [root])).toBe(false);
    });
  });

  describe('ZS-MERKLE-V1 (legacy, verify-only)', () => {
    it('still reproduces V1 roots and proofs so existing checkpoints verify', () => {
      const leaves = ['leaf-a', 'leaf-b', 'leaf-c'];
      const result = service.build(leaves, TREE_PROFILE_V1);
      expect(result.treeProfile).toBe(TREE_PROFILE_V1);
      leaves.forEach((leaf, i) => {
        expect(
          service.verifyInclusion(leaf, result.proofs[i], result.root),
        ).toBe(true);
      });
    });

    it('documents the duplicate-last-node collision V2 exists to remove', () => {
      expect(service.computeRoot(['a', 'b', 'c'], TREE_PROFILE_V1)).toBe(
        service.computeRoot(['a', 'b', 'c', 'c'], TREE_PROFILE_V1),
      );
    });

    it('is identical to V2 for power-of-two sizes', () => {
      [1, 2, 4, 8, 16].forEach((n) => {
        expect(service.computeRoot(leavesOf(n), TREE_PROFILE_V1)).toBe(
          service.computeRoot(leavesOf(n), TREE_PROFILE_V2),
        );
      });
    });
  });
});
