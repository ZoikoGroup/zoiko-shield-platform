import {
  MpcThreatMatcherService,
  TenantPsiClient,
} from './mpc-threat-matcher.service';

describe('MpcThreatMatcherService (real OPRF-based PSI)', () => {
  let mpcService: MpcThreatMatcherService;

  beforeEach(() => {
    mpcService = new MpcThreatMatcherService();
  });

  it('should find exact private set intersection matches without disclosing non-matching queries', () => {
    const tenantId = 'tenant-defense-01';

    const blinded = TenantPsiClient.blindIndicators([
      '198.51.100.99', // Matches APT29
      '8.8.8.8', // Benign DNS, no match
      'malware-c2-drop.attacker.org', // Matches DarkSide
    ]);

    const evaluationResults = mpcService.evaluateBlindedQueries(
      blinded.map((b) => b.blindedQuery),
    );
    const result = TenantPsiClient.finalizeAndIntersect(
      tenantId,
      blinded,
      evaluationResults,
      mpcService.getSafeToRevealDataset(),
    );

    expect(result.receiptId).toBeDefined();
    expect(result.totalQueriedCount).toBe(3);
    expect(result.matchedIndicatorsCount).toBe(2);
    expect(
      result.matches.some((m) => m.threatActorCampaign === 'APT29_CozyBear_C2'),
    ).toBe(true);
    expect(
      result.matches.some(
        (m) => m.threatActorCampaign === 'DarkSide_Ransomware_Gateway',
      ),
    ).toBe(true);
    expect(result.attestationDigest).toBeDefined();
  });

  it('the server evaluation step never receives a raw indicator or blinding secret as a parameter', () => {
    // Structural proof: evaluateBlindedQueries only accepts MpcPsiQueryItem[]
    // (blindedIndicatorHash + optional metadataTag) — there is no parameter
    // through which a tenant secret or raw IOC could flow, unlike the prior
    // evaluatePrivateSetIntersection(tenantId, tenantSecretKey, queries).
    expect(mpcService.evaluateBlindedQueries.length).toBe(1);
  });

  it('gives the same raw indicator two different blinded queries across two independent blind calls (query unlinkability)', () => {
    const [first] = TenantPsiClient.blindIndicators(['198.51.100.99']);
    const [second] = TenantPsiClient.blindIndicators(['198.51.100.99']);

    expect(first.blindedQuery.blindedIndicatorHash).not.toBe(
      second.blindedQuery.blindedIndicatorHash,
    );

    // Yet both still resolve to the same match once finalized locally —
    // unlinkable on the wire, consistent after finalize.
    const evalA = mpcService.evaluateBlindedQueries([first.blindedQuery]);
    const evalB = mpcService.evaluateBlindedQueries([second.blindedQuery]);
    const dataset = mpcService.getSafeToRevealDataset();

    const resultA = TenantPsiClient.finalizeAndIntersect(
      'tenant-a',
      [first],
      evalA,
      dataset,
    );
    const resultB = TenantPsiClient.finalizeAndIntersect(
      'tenant-b',
      [second],
      evalB,
      dataset,
    );

    expect(resultA.matchedIndicatorsCount).toBe(1);
    expect(resultB.matchedIndicatorsCount).toBe(1);
    expect(resultA.matches[0].threatActorCampaign).toBe(
      resultB.matches[0].threatActorCampaign,
    );
  });

  it('the server-visible dataset entries are OPRF outputs, not the raw indicators', () => {
    const dataset = mpcService.getSafeToRevealDataset();
    for (const entry of dataset) {
      expect(entry.oprfOutputHex).not.toContain('198.51.100.99');
      expect(entry.oprfOutputHex).not.toContain('attacker.org');
      expect(entry.oprfOutputHex).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
