import { SloMetricsExporterService } from './slo-metrics-exporter.service';

describe('SloMetricsExporterService (LAB 16 Observability & SLO Exporter)', () => {
  let sloService: SloMetricsExporterService;

  beforeEach(() => {
    sloService = new SloMetricsExporterService();
  });

  it('should format all mandatory signal areas into PromQL metric series', () => {
    const tenantId = 'tenant-fintech-01';

    const snapshot = sloService.generateSloMetricsSnapshot(tenantId, {
      ingestion: {
        tenantId,
        acceptanceRatePercentage: 99.98,
        lagMs: 45,
        normalizationSuccessPercentage: 99.95,
        quarantineCount: 2,
        connectorState: 'HEALTHY',
      },
      detection: {
        tenantId,
        p99LatencyMs: 120,
        replayDeterminismPercentage: 100.0,
        falsePositiveReviewRate: 0.02,
        stateStoreHealth: 'OPTIMAL',
      },
      caseResponse: {
        tenantId,
        alertToTriageAvgSeconds: 42,
        caseAgeHours: 3.5,
        approvalLatencySeconds: 15,
        executedActionsCount: 18,
        rollbackActionsCount: 0,
      },
      evidence: {
        tenantId,
        freshnessSeconds: 12,
        completenessPercentage: 100.0,
        ledgerVerifiedCount: 450,
        anchorPublicationLatencyMs: 800,
      },
      aiGateway: {
        tenantId,
        modelVersion: 'gemini-1.5-pro-preview',
        avgGroundingScore: 0.985,
        citationValidityPercentage: 100.0,
        blockedVerdictsCount: 0,
        totalTokensUsed: 125000,
        tenantAttributableCostUsd: 1.452,
      },
    });

    expect(snapshot.snapshotId).toBeDefined();
    expect(snapshot.promQlFormattedMetrics.length).toBeGreaterThanOrEqual(7);
    expect(
      snapshot.promQlFormattedMetrics.some((m) =>
        m.includes('zoikoshield_ingest_acceptance_rate'),
      ),
    ).toBe(true);
    expect(
      snapshot.promQlFormattedMetrics.some((m) =>
        m.includes('zoikoshield_ai_grounding_score'),
      ),
    ).toBe(true);
    expect(
      snapshot.promQlFormattedMetrics.some((m) =>
        m.includes('zoikoshield_tenant_cost_usd'),
      ),
    ).toBe(true);
    expect(snapshot.attestationDigest).toHaveLength(64);
  });
});
