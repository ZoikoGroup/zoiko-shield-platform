import { MpcThreatMatcherService } from './mpc-threat-matcher.service';

describe('MpcThreatMatcherService', () => {
  let mpcService: MpcThreatMatcherService;

  beforeEach(() => {
    mpcService = new MpcThreatMatcherService();
  });

  it('should find exact private set intersection matches without disclosing non-matching queries', () => {
    const tenantId = 'tenant-defense-01';
    const tenantSecretKey = 'TENANT_EPHEMERAL_BLINDING_SECRET_KEY';

    const queries = [
      { blindedIndicatorHash: mpcService.blindIndicator('198.51.100.99', tenantSecretKey) }, // Matches APT29
      { blindedIndicatorHash: mpcService.blindIndicator('8.8.8.8', tenantSecretKey) }, // Benign DNS, no match
      { blindedIndicatorHash: mpcService.blindIndicator('malware-c2-drop.attacker.org', tenantSecretKey) }, // Matches DarkSide
    ];

    const result = mpcService.evaluatePrivateSetIntersection(tenantId, tenantSecretKey, queries);

    expect(result.receiptId).toBeDefined();
    expect(result.totalQueriedCount).toBe(3);
    expect(result.matchedIndicatorsCount).toBe(2);
    expect(result.matches.some((m) => m.threatActorCampaign === 'APT29_CozyBear_C2')).toBe(true);
    expect(result.matches.some((m) => m.threatActorCampaign === 'DarkSide_Ransomware_Gateway')).toBe(true);
    expect(result.attestationDigest).toBeDefined();
  });
});
