import { ContentHashService as ShieldActionContentHashService } from './content-hash.service';
import { ContentHashService as ShieldCoreContentHashService } from '../../../shield-core/src/modules/evidence/hashing/content-hash.service';

/**
 * shield-action independently recomputes approved_material_hash rather
 * than trusting shield-core's stored value (correction #3). Since the two
 * services are deliberately separate copies (no shared package exists
 * yet), this proves they stay byte-for-byte identical for the same input
 * — the actual safety property the reauthorization pipeline relies on.
 */
describe('ContentHashService cross-app consistency', () => {
  it('produces the same hash in shield-action as shield-core for the same approval material', () => {
    const material = {
      tenantId: 't1',
      environmentId: 'e1',
      proposalId: 'p1',
      proposalVersion: 1,
      actionType: 'REVOKE_SESSIONS',
      targetType: 'IDENTITY',
      targetId: 'id1',
      authorityLevel: 'R1',
      policyVersion: '1.0',
      approvalExpiresAt: '2026-01-01T00:00:00.000Z',
    };

    const shieldActionHash =
      new ShieldActionContentHashService().hashCanonicalJson(material);
    const shieldCoreHash = new ShieldCoreContentHashService().hashCanonicalJson(
      material,
    );

    expect(shieldActionHash.contentHash).toBe(shieldCoreHash.contentHash);
  });
});
