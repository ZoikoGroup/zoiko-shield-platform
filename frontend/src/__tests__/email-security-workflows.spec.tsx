import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/email',
  useParams: () => ({ threatId: 'threat-1', analysisId: 'analysis-1' }),
  useSearchParams: () => new URLSearchParams(),
}));

import { ZoikoShieldApiClient } from '@/lib/api-client';
import { formatTimestamp } from '@/lib/utils';
import { findActiveNav } from '@/components/layout/nav-config';
import EmailOverviewPage from '@/app/email/page';
import EmailConnectorsPage from '@/app/email/connectors/page';
import EmailConnectorSetupPage from '@/app/email/connectors/setup/page';
import EmailConnectorHealthPage from '@/app/email/connectors/health/page';
import EmailThreatQueuePage from '@/app/email/threats/page';
import EmailThreatDetailPage from '@/app/email/threats/[threatId]/page';
import EmailControlCoveragePage from '@/app/email/coverage/page';
import EmailEvidencePage from '@/app/email/evidence/page';
import EmailPoliciesPage from '@/app/email/policies/page';
import EmailAiIntelligencePage from '@/app/email/intelligence/page';
import EmailAnalysisDetailPage from '@/app/email/analyses/[analysisId]/page';
import EmailActionsPage from '@/app/email/actions/page';
import EmailSettingsGovernancePage from '@/app/email/settings/page';
import PricingSuccessPage from '@/app/pricing/success/page';
import PricingCancelledPage from '@/app/pricing/cancelled/page';

describe('ZoikoShield Email Security & Commercial Fix Workflows (WF-01..WF-14)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders honest NO_COVERAGE posture with zero ZoikoMail references on /email (T01)', async () => {
    vi.spyOn(ZoikoShieldApiClient, 'getEmailOverview').mockResolvedValue({
      protectionState: 'NO_COVERAGE',
      truthBanner:
        'No active email source connected. Email threat visibility cannot be reported until a read-only Microsoft 365 or Google Workspace connector is verified.',
      windowHours: 24,
      phase2ActionsLocked: true,
      connectorsSummary: { total: 0, active: 0, degraded: 0, revoked: 0 },
      coverageDenominator: {
        eligibleEvents: 0,
        ingestedEvents: 0,
        rejectedEvents: 0,
        missingEvents: 0,
        completenessGrade: 'UNKNOWN',
      },
      openFindingsCount: 0,
      criticalFindingsCount: 0,
      pendingActionsCount: 0,
      activePolicyVersion: null,
      providers: [],
      recentThreats: [],
    });

    const { container } = render(<EmailOverviewPage />);
    await waitFor(() => {
      expect(screen.getByText(/No Email Telemetry Coverage Configured/i)).toBeTruthy();
    });
    expect(screen.getByText(/Phase 2 Mailbox Actions Locked/i)).toBeTruthy();
    expect(container.textContent).not.toMatch(/zoikomail/i);
  });

  it('offers only Microsoft 365 and Google Workspace on onboarding wizard (WF-03, Shield-only)', () => {
    const { container } = render(<EmailConnectorSetupPage />);
    expect(screen.getAllByText(/Microsoft 365 Defender/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Google Workspace Alert Center/i).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/zoikomail/i);
  });

  it('renders all WF-02..WF-14 email security workspaces cleanly without crashing', async () => {
    vi.spyOn(ZoikoShieldApiClient, 'listEmailConnectors').mockResolvedValue([]);
    vi.spyOn(ZoikoShieldApiClient, 'listEmailReconciliations').mockResolvedValue([]);
    vi.spyOn(ZoikoShieldApiClient, 'listEmailThreats').mockResolvedValue({
      items: [],
      completenessDisclaimer: 'Coverage check active',
    });
    vi.spyOn(ZoikoShieldApiClient, 'getEmailThreatDetail').mockResolvedValue({
      id: 'threat-1',
      provider: 'MICROSOFT_365',
      provider_verdict: 'PHISHING',
      threat_class: 'BEC',
      severity: 'HIGH',
      status: 'OBSERVED',
      observed_at: '2026-11-23T10:00:00Z',
      subject_ref: 'hash-subj-1',
      source_event_ref: 'evt-1',
      detectionDecisions: [],
    });
    vi.spyOn(ZoikoShieldApiClient, 'getEmailControlsCoverage').mockResolvedValue({
      disclaimer: 'Telemetry bounded coverage',
      controls: [],
    });
    vi.spyOn(ZoikoShieldApiClient, 'listEmailEvidenceManifests').mockResolvedValue([]);
    vi.spyOn(ZoikoShieldApiClient, 'listEmailPolicies').mockResolvedValue([]);
    vi.spyOn(ZoikoShieldApiClient, 'getEmailBehaviourOverview').mockResolvedValue({
      benchmark: {
        totalEvaluated: 0,
        incrementalDetectionsMissedByNative: 0,
        precision: null,
        abstentionRate: 0,
        totalFalsePositiveCostUsd: 0,
        methodologyNote: 'Blinded comparison',
      },
      recentDecisions: [],
    });
    vi.spyOn(ZoikoShieldApiClient, 'getEmailAnalysisDetail').mockResolvedValue({
      id: 'analysis-1',
      toolExecutionAllowed: false,
      abstained: true,
      source_facts: [],
      inferences: [],
      unknowns: ['Insufficient headers'],
      citation_refs: [],
    });
    vi.spyOn(ZoikoShieldApiClient, 'listEmailActions').mockResolvedValue({
      phase2ActionsLocked: true,
      proposals: [],
    });
    vi.spyOn(ZoikoShieldApiClient, 'getEmailSettings').mockResolvedValue({
      recentAudit: [],
    });
    vi.spyOn(ZoikoShieldApiClient, 'getEmailPrivacyInventory').mockResolvedValue({
      dataMinimizationMode: 'METADATA_AND_HASHED_INDICATORS_ONLY',
      rawBodyStorageEnabled: false,
      sources: [],
    });

    const pages = [
      <EmailConnectorsPage key="c" />,
      <EmailConnectorHealthPage key="h" />,
      <EmailThreatQueuePage key="q" />,
      <EmailThreatDetailPage key="d" />,
      <EmailControlCoveragePage key="cov" />,
      <EmailEvidencePage key="ev" />,
      <EmailPoliciesPage key="pol" />,
      <EmailAiIntelligencePage key="ai" />,
      <EmailAnalysisDetailPage key="an" />,
      <EmailActionsPage key="act" />,
      <EmailSettingsGovernancePage key="set" />,
    ];

    for (const page of pages) {
      const { unmount } = render(page);
      expect(document.body.textContent?.length).toBeGreaterThan(0);
      unmount();
    }
  });

  it('formats timestamps cleanly in explicit UTC mode (T19)', () => {
    const out = formatTimestamp('2026-11-23T08:15:30.000Z', 'UTC');
    expect(out).toContain('UTC');
    expect(out).toContain('08:15:30');
  });

  it('renders pricing success and cancelled routes with C02 governance notice and zero invented prices', () => {
    const succ = render(<PricingSuccessPage />);
    expect(succ.container.textContent).toMatch(/NOT APPROVED/i);
    expect(succ.container.textContent).not.toMatch(/\$\d/);
    succ.unmount();

    const canc = render(<PricingCancelledPage />);
    expect(canc.container.textContent).toMatch(/Checkout Cancelled/i);
    expect(canc.container.textContent).not.toMatch(/\$\d/);
    canc.unmount();
  });

  it('resolves Email Security routes cleanly in sidebar nav-config', () => {
    expect(findActiveNav('/email')?.item.href).toBe('/email');
    expect(findActiveNav('/email/threats/abc')?.item.href).toBe('/email/threats');
    expect(findActiveNav('/email/connectors/setup')?.item.href).toBe('/email/connectors');
  });
});
