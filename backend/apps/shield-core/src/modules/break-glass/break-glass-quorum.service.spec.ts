import { BreakGlassQuorumService } from './break-glass-quorum.service';
import { UnauthorizedException } from '@nestjs/common';

describe('BreakGlassQuorumService', () => {
  let quorumService: BreakGlassQuorumService;

  beforeEach(() => {
    quorumService = new BreakGlassQuorumService();
  });

  it('should split secret into 5 shares and reconstruct perfectly with any 3 shares (3-of-5 threshold)', () => {
    const originalSecret = 'SUPER_SECRET_EMERGENCY_MASTER_KEY_2026_!@#$%^&*()';

    const vaultSession = quorumService.generateBreakGlassShares({
      tenantId: 'tenant-enterprise-bank',
      secretText: originalSecret,
      thresholdK: 3,
      totalSharesN: 5,
      custodians: [
        { custodianId: 'ciso-alice', custodianRole: 'CHIEF_INFORMATION_SECURITY_OFFICER' },
        { custodianId: 'dpo-bob', custodianRole: 'DATA_PROTECTION_OFFICER' },
        { custodianId: 'lead-secops-charlie', custodianRole: 'LEAD_SECOPS_ENGINEER' },
        { custodianId: 'vp-infra-diana', custodianRole: 'VP_INFRASTRUCTURE' },
        { custodianId: 'legal-counsel-edward', custodianRole: 'GENERAL_COUNSEL' },
      ],
    });

    expect(vaultSession.custodianShares.length).toBe(5);

    // Pick shares 1, 3, 5 (Alice, Charlie, Edward)
    const selectedShares = [
      vaultSession.custodianShares[0],
      vaultSession.custodianShares[2],
      vaultSession.custodianShares[4],
    ];

    const result = quorumService.reconstructMasterSecret(selectedShares, 3);

    expect(result.quorumMet).toBe(true);
    expect(result.recoveredSecret).toBe(originalSecret);
    expect(result.participatingCustodians).toEqual(['ciso-alice', 'lead-secops-charlie', 'legal-counsel-edward']);
    expect(result.breakGlassAttestationDigest).toBeDefined();
  });

  it('should throw UnauthorizedException when fewer than k shares are provided', () => {
    const originalSecret = 'TOP_SECRET_PASSPHRASE';

    const vaultSession = quorumService.generateBreakGlassShares({
      tenantId: 'tenant-enterprise-bank',
      secretText: originalSecret,
      thresholdK: 3,
      totalSharesN: 5,
      custodians: [
        { custodianId: 'cust-1', custodianRole: 'ROLE_1' },
        { custodianId: 'cust-2', custodianRole: 'ROLE_2' },
        { custodianId: 'cust-3', custodianRole: 'ROLE_3' },
        { custodianId: 'cust-4', custodianRole: 'ROLE_4' },
        { custodianId: 'cust-5', custodianRole: 'ROLE_5' },
      ],
    });

    // Only 2 shares provided (threshold is 3)
    const insufficientShares = [vaultSession.custodianShares[0], vaultSession.custodianShares[1]];

    expect(() => {
      quorumService.reconstructMasterSecret(insufficientShares, 3);
    }).toThrow(UnauthorizedException);
  });
});
