import { MerkleTreeService } from '../merkle/merkle-tree.service';
import { EmailEvidenceService } from './email-evidence.service';

describe('EmailEvidenceService (T14, T15, E09)', () => {
  const service = new EmailEvidenceService(new MerkleTreeService());

  it('anchors manifest and distinguishes valid cryptographic proof WITH missing period gaps (T15 / E09)', () => {
    const anchored = service.anchorManifest({
      manifestId: 'man-1',
      tenantId: 'tenant-1',
      canonicalEventHashes: ['sha256:aaa111', 'sha256:bbb222'],
      sourceInventory: [{ provider: 'MICROSOFT_365', connectionId: 'c1' }],
      exclusions: [{ mailboxGroup: 'shared-legacy', reason: 'UNLICENSED' }],
      coverageGaps: [{ windowStart: '2026-11-22T01:00:00Z', missingCount: 3 }],
    });

    expect(anchored.hasKnownGaps).toBe(true);
    expect(anchored.assuranceStatement).toMatch(
      /Some source events may be missing/,
    );

    const verified = service.verifyManifest({
      canonicalEventHashes: ['sha256:aaa111', 'sha256:bbb222'],
      sourceInventory: [{ provider: 'MICROSOFT_365', connectionId: 'c1' }],
      exclusions: [{ mailboxGroup: 'shared-legacy', reason: 'UNLICENSED' }],
      coverageGaps: [{ windowStart: '2026-11-22T01:00:00Z', missingCount: 3 }],
      expectedMerkleRoot: anchored.merkleRoot,
      expectedDetachedChecksum: anchored.detachedChecksum,
    });

    expect(verified.verified).toBe(true);
    expect(verified.hasKnownGaps).toBe(true);
    expect(verified.missingPeriodsCount).toBe(1);
  });

  it('detects tampered event hashes deterministically (T14)', () => {
    const anchored = service.anchorManifest({
      manifestId: 'man-2',
      tenantId: 'tenant-1',
      canonicalEventHashes: ['sha256:aaa111', 'sha256:bbb222'],
      sourceInventory: [],
      exclusions: [],
      coverageGaps: [],
    });

    const tampered = service.verifyManifest({
      canonicalEventHashes: ['sha256:aaa111', 'sha256:TAMPERED'],
      sourceInventory: [],
      exclusions: [],
      coverageGaps: [],
      expectedMerkleRoot: anchored.merkleRoot,
      expectedDetachedChecksum: anchored.detachedChecksum,
    });

    expect(tampered.verified).toBe(false);
    expect(tampered.status).toBe('VERIFICATION_FAILED');
    expect(tampered.rootMatches).toBe(false);
  });
});
