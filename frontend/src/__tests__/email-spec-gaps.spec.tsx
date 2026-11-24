import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import axe from 'axe-core';

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/email',
  useParams: () => ({ threatId: 'threat-1', analysisId: 'analysis-1' }),
  useSearchParams: () => mockSearchParams,
}));

import { ZoikoShieldApiClient, ZoikoShieldApiError } from '@/lib/api-client';
import { EMAIL_COPY, EMAIL_STATE_COPY } from '@/lib/email-copy';
import EmailOverviewPage from '@/app/email/page';
import EmailConnectorsPage from '@/app/email/connectors/page';
import EmailConnectorSetupPage from '@/app/email/connectors/setup/page';
import EmailConnectorCallbackPage from '@/app/email/connectors/callback/page';
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

async function runAxe(container: HTMLElement) {
  return axe.run(container, {
    rules: {
      // jsdom does not compute visual CSS colours
      'color-contrast': { enabled: false },
      // pages render inside the app shell layout, which owns the landmarks
      region: { enabled: false },
    },
  });
}

const OBSERVED = '2026-11-23T08:15:30.000Z';

const connector = (over: Record<string, unknown> = {}) => ({
  id: 'conn-1',
  tenant_id: 't-1',
  environment_id: 'env',
  provider: 'MICROSOFT_365',
  display_name: 'M365 Defender Telemetry',
  status: 'ACTIVE',
  status_reason: null,
  consent_expires_at: '2099-01-01T00:00:00.000Z',
  residency_code: 'eu-west-1',
  sync_frequency: 'POLL_5M',
  retention_days: 90,
  legal_hold: false,
  requested_scopes: ['SecurityAlert.Read.All'],
  granted_scopes: ['SecurityAlert.Read.All'],
  last_sync_at: OBSERVED,
  last_heartbeat_at: OBSERVED,
  revoked_at: null,
  created_at: OBSERVED,
  ...over,
});

const finding = (over: Record<string, unknown> = {}) => ({
  id: 'threat-1',
  connection_id: 'conn-1',
  provider: 'MICROSOFT_365',
  provider_verdict: 'PHISHING',
  threat_class: 'BEC',
  severity: 'HIGH',
  status: 'OBSERVED',
  policy_version: 'v3',
  observed_at: OBSERVED,
  ingested_at: OBSERVED,
  subject_ref: 'm365:abc123',
  source_event_ref: 'evt-source-77',
  source_confidence: 'HIGH',
  coverage_state: 'COMPLETE',
  case_id: null,
  indicator_hashes: [],
  attachment_hashes: [],
  deep_link_url: null,
  metadata: {},
  version: 4,
  detectionDecisions: [],
  ...over,
});

const overview = (over: Record<string, unknown> = {}) => ({
  protectionState: 'HEALTHY_SYNCED',
  truthBanner: 'Bounded read-only telemetry.',
  windowHours: 24,
  phase2ActionsLocked: true,
  connectorsSummary: { total: 1, active: 1, degraded: 0, revoked: 0 },
  coverageDenominator: {
    eligibleEvents: 10,
    ingestedEvents: 10,
    rejectedEvents: 0,
    missingEvents: 0,
    completenessGrade: 'COMPLETE',
  },
  openFindingsCount: 1,
  criticalFindingsCount: 0,
  pendingActionsCount: 0,
  activePolicyVersion: 'v3',
  providers: [
    {
      id: 'conn-1',
      provider: 'MICROSOFT_365',
      displayName: 'M365 Defender Telemetry',
      status: 'ACTIVE',
      residencyCode: 'eu-west-1',
      lastSyncAt: OBSERVED,
      lastHeartbeatAt: OBSERVED,
    },
  ],
  recentThreats: [
    {
      id: 'threat-1',
      provider: 'MICROSOFT_365',
      threatClass: 'BEC',
      severity: 'HIGH',
      status: 'OBSERVED',
      providerVerdict: 'PHISHING',
      observedAt: OBSERVED,
      caseId: null,
    },
  ],
  ...over,
});

const provenance = {
  findingId: 'threat-1',
  sourceEventRef: 'evt-source-77',
  provider: 'MICROSOFT_365',
  providerVerdict: 'PHISHING',
  policyId: 'pol-1',
  policyVersion: 'v3',
  detectorDecisions: [],
  observedAt: OBSERVED,
  ingestedAt: OBSERVED,
  lastReconciledAt: OBSERVED,
  sourcePermissionTier: 'READ_ONLY_ALERTS',
  licenceAssumptions: {},
  dataFreshness: { lastSyncAt: OBSERVED, sourceHealth: 'HEALTHY_SYNCED' },
  coverageExceptions: [
    { windowStart: OBSERVED, windowEnd: OBSERVED, completenessGrade: 'DEGRADED', missingCount: 3 },
  ],
  timeline: [
    { stage: 'SOURCE_OBSERVED', at: OBSERVED, ref: 'evt-source-77' },
    { stage: 'INGESTED', at: OBSERVED, ref: null },
  ],
};

function mockAllEmailReads() {
  vi.spyOn(ZoikoShieldApiClient, 'getEmailOverview').mockResolvedValue(overview() as any);
  vi.spyOn(ZoikoShieldApiClient, 'listEmailConnectors').mockResolvedValue([connector()] as any);
  vi.spyOn(ZoikoShieldApiClient, 'listEmailProviders').mockResolvedValue([
    { provider: 'MICROSOFT_365', displayName: 'Microsoft 365 Defender', enabled: true, connectMethod: 'OAUTH' },
    { provider: 'GOOGLE_WORKSPACE', displayName: 'Google Workspace Alert Center', enabled: true, connectMethod: 'OAUTH' },
    {
      provider: 'ZOIKO_MAIL',
      displayName: 'Zoiko Mail',
      enabled: false,
      connectMethod: 'MAIL_BINDING',
      reasonDisabled: 'Pending ADR-ZSSEC-01 / decision D05.',
    },
  ]);
  vi.spyOn(ZoikoShieldApiClient, 'listEmailReconciliations').mockResolvedValue([
    {
      id: 'w-1',
      connection_id: 'conn-1',
      connection: { display_name: 'M365 Defender Telemetry', provider: 'MICROSOFT_365' },
      window_start: OBSERVED,
      window_end: OBSERVED,
      expected_count: null,
      ingested_count: 4,
      rejected_count: 0,
      missing_count: 0,
      completeness_grade: 'UNKNOWN',
      source_health: 'STALE',
    },
  ] as any);
  vi.spyOn(ZoikoShieldApiClient, 'listEmailThreats').mockResolvedValue({
    items: [finding()],
    completenessDisclaimer: '',
  });
  vi.spyOn(ZoikoShieldApiClient, 'getEmailThreatDetail').mockResolvedValue(finding() as any);
  vi.spyOn(ZoikoShieldApiClient, 'getEmailThreatProvenance').mockResolvedValue(provenance as any);
  vi.spyOn(ZoikoShieldApiClient, 'getEmailControlsCoverage').mockResolvedValue({
    disclaimer: 'Coverage reflects verified telemetry windows only.',
    controls: [
      {
        controlId: 'CC7.2',
        framework: 'SOC 2',
        title: 'Anomaly monitoring',
        status: 'GAP_DETECTED',
        numerator: 3,
        denominator: 4,
        excluded: [{ connectionId: 'conn-9', provider: 'GOOGLE_WORKSPACE', reason: 'Consent expired' }],
        missingPrerequisites: [],
      },
    ],
  });
  vi.spyOn(ZoikoShieldApiClient, 'getEmailControlEvidence').mockResolvedValue({
    controlId: 'CC7.2',
    windowStart: OBSERVED,
    windowEnd: OBSERVED,
    numerator: 3,
    denominator: 4,
    excluded: [],
    manifests: [{ id: 'man-1', merkleRoot: 'abc', createdAt: OBSERVED, coverageGaps: [{}] }],
    findings: [{ id: 'threat-1', observedAt: OBSERVED, policyVersion: 'v3' }],
  });
  vi.spyOn(ZoikoShieldApiClient, 'listEmailEvidenceManifests').mockResolvedValue([
    {
      id: 'man-1',
      status: 'SEALED',
      time_start: OBSERVED,
      time_end: OBSERVED,
      merkle_root: 'abc',
      coverage_gaps: [{ reason: 'PROVIDER_429' }],
    },
  ] as any);
  vi.spyOn(ZoikoShieldApiClient, 'listEmailPolicies').mockResolvedValue([
    {
      id: 'pol-1',
      name: 'Default',
      policy_key: 'k',
      version: 3,
      rationale: 'r',
      status: 'ACTIVE',
      authored_by: 'a',
      approved_by: 'b',
    },
  ]);
  vi.spyOn(ZoikoShieldApiClient, 'getEmailBehaviourOverview').mockResolvedValue({
    benchmark: {
      totalEvaluated: 3,
      incrementalDetectionsMissedByNative: 1,
      precision: 0.5,
      precisionCi95: { point: 0.5, lower: 0.1, upper: 0.9, n: 2 },
      abstentionRate: 0.33,
      totalFalsePositiveCostUsd: 12,
      methodologyNote: 'Blinded comparison',
    },
    recentDecisions: [
      { id: 'analysis-1', detector_tier: 'BEHAVIORAL', abstained: true, adjudicated_label: null },
    ],
  });
  vi.spyOn(ZoikoShieldApiClient, 'getEmailAnalysisDetail').mockResolvedValue({
    id: 'analysis-1',
    version: 2,
    toolExecutionAllowed: false,
    abstained: true,
    source_facts: [{ ref: 'evt-1', detail: 'Lookalike domain' }],
    inferences: ['Possible vendor impersonation'],
    unknowns: ['No header telemetry'],
    citation_refs: ['evt-1'],
  });
  vi.spyOn(ZoikoShieldApiClient, 'listEmailActions').mockResolvedValue({
    phase2ActionsLocked: true,
    proposals: [
      {
        id: 'prop-1',
        provider: 'MICROSOFT_365',
        requested_action: 'QUARANTINE_MESSAGE',
        risk_class: 'R3',
        status: 'NOT_EXECUTED',
        initiated_by: 'a',
        approved_by: 'b',
      },
    ],
  });
  vi.spyOn(ZoikoShieldApiClient, 'getEmailSettings').mockResolvedValue({
    recentAudit: [{ id: 'au-1', event_type: 'CONNECTION_REVOKED', actor_id: 'u', created_at: OBSERVED }],
  });
  vi.spyOn(ZoikoShieldApiClient, 'getEmailPrivacyInventory').mockResolvedValue({
    dataMinimizationMode: 'METADATA_AND_HASHED_INDICATORS_ONLY',
    rawBodyStorageEnabled: false,
    sources: [
      {
        connectionId: 'conn-1',
        displayName: 'M365',
        provider: 'MICROSOFT_365',
        status: 'ACTIVE',
        residencyCode: 'eu-west-1',
        retentionDays: 90,
      },
    ],
  });
  vi.spyOn(ZoikoShieldApiClient, 'listEmailAccessGrants').mockResolvedValue({
    grants: [
      {
        manifestId: 'man-1',
        auditorPrincipalId: 'auditor-1',
        expiresAt: '2099-01-01T00:00:00.000Z',
        revokedAt: null,
        active: true,
      },
    ],
  });
  vi.spyOn(ZoikoShieldApiClient, 'completeEmailConnectionCallback').mockResolvedValue({
    intentId: 'intent-1',
    status: 'VERIFIED',
    connection: { id: 'conn-1', status: 'VALIDATING', provider: 'MICROSOFT_365', display_name: 'M365' },
  });
}

describe('ZS-UX-EMTI-001 email spec gaps (frontend)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSearchParams = new URLSearchParams();
    try {
      localStorage.removeItem('zoiko_timezone_mode');
    } catch {}
    mockAllEmailReads();
  });

  afterEach(() => {
    try {
      localStorage.removeItem('zoiko_timezone_mode');
    } catch {}
  });

  // ---------------------------------------------------------------- T20 axe
  const pages: Array<[string, () => React.ReactElement, RegExp]> = [
    ['overview /email', () => <EmailOverviewPage />, /Configured Email Telemetry Sources/],
    ['connectors', () => <EmailConnectorsPage />, /M365 Defender Telemetry/],
    ['setup wizard', () => <EmailConnectorSetupPage />, /Step 1: Select/],
    ['oauth callback', () => <EmailConnectorCallbackPage />, /Provider Consent Result/],
    ['source health', () => <EmailConnectorHealthPage />, /Stale telemetry/],
    ['threat queue', () => <EmailThreatQueuePage />, /evt-source-77/],
    ['threat detail', () => <EmailThreatDetailPage />, /Provenance & Freshness/],
    ['control coverage', () => <EmailControlCoveragePage />, /Anomaly monitoring/],
    ['evidence', () => <EmailEvidencePage />, /Manifest man-1/],
    ['policies', () => <EmailPoliciesPage />, /Default/],
    ['intelligence', () => <EmailAiIntelligencePage />, /Blinded comparison/],
    ['analysis review', () => <EmailAnalysisDetailPage />, /Human Reviewer Disposition/],
    ['actions', () => <EmailActionsPage />, /QUARANTINE_MESSAGE \(R3\)/],
    ['settings', () => <EmailSettingsGovernancePage />, /External Auditor Access Grants/],
  ];

  it.each(pages)('%s has no axe WCAG violations once loaded (T20)', async (_name, make, ready) => {
    mockSearchParams = new URLSearchParams({ state: 's-1', code: 'c-1' });
    const { container } = render(make());
    await waitFor(() => expect(screen.getAllByText(ready).length).toBeGreaterThan(0));
    const results = await runAxe(container);
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  // ------------------------------------------------------- Appendix A copy
  it('shows the canonical no-source copy and never "No threats detected" (T01)', async () => {
    vi.spyOn(ZoikoShieldApiClient, 'getEmailOverview').mockResolvedValue(
      overview({
        protectionState: 'NO_COVERAGE',
        providers: [],
        recentThreats: [],
        connectorsSummary: { total: 0, active: 0, degraded: 0, revoked: 0 },
      }) as any,
    );
    const { container } = render(<EmailOverviewPage />);
    await waitFor(() =>
      expect(screen.getAllByText(EMAIL_COPY.NO_CONNECTED_SOURCE).length).toBeGreaterThan(0),
    );
    expect(container.textContent).not.toMatch(/No threats detected/i);
  });

  it('distinguishes stale data from no data (T07)', async () => {
    vi.spyOn(ZoikoShieldApiClient, 'getEmailOverview').mockResolvedValue(
      overview({ protectionState: 'STALE', recentThreats: [] }) as any,
    );
    const { unmount } = render(<EmailOverviewPage />);
    await waitFor(() => expect(screen.getAllByText(EMAIL_COPY.SOURCE_LAG).length).toBeGreaterThan(0));
    unmount();

    vi.spyOn(ZoikoShieldApiClient, 'getEmailOverview').mockResolvedValue(
      overview({ protectionState: 'HEALTHY_SYNCED', recentThreats: [] }) as any,
    );
    render(<EmailOverviewPage />);
    await waitFor(() =>
      expect(screen.getByText(EMAIL_STATE_COPY.NO_DATA_FOR_WINDOW)).toBeInTheDocument(),
    );
  });

  it('renders the permission-denial copy for a 403 instead of the raw error', async () => {
    vi.spyOn(ZoikoShieldApiClient, 'listEmailThreats').mockRejectedValue(
      new ZoikoShieldApiError('Forbidden resource', 403, '/api/v1/email/threats'),
    );
    const { container } = render(<EmailThreatQueuePage />);
    await waitFor(() => expect(screen.getByText(EMAIL_COPY.PERMISSION_DENIAL)).toBeInTheDocument());
    expect(container.textContent).not.toMatch(/Forbidden resource/);
  });

  it('never renders an expired-consent connector as active (18.1 / T05)', async () => {
    vi.spyOn(ZoikoShieldApiClient, 'listEmailConnectors').mockResolvedValue([
      connector({ status: 'ACTIVE', consent_expires_at: '2020-01-01T00:00:00.000Z' }),
    ] as any);
    const { container } = render(<EmailConnectorsPage />);
    await waitFor(() => expect(screen.getByText(/Suspended — consent expired/)).toBeInTheDocument());
    expect(container.querySelector('[data-connector-status="ACTIVE"]')).toBeNull();
    expect(screen.getByText(/Pending ADR-ZSSEC-01/)).toBeInTheDocument();
  });

  it('shows the scope-unavailable copy for a limited capability test and never "success" from handshake alone', async () => {
    vi.spyOn(ZoikoShieldApiClient, 'testEmailConnector').mockResolvedValue({
      passed: false,
      status: 'DEGRADED',
      testedAt: OBSERVED,
      capabilityReport: {
        availableEventTypes: [],
        unavailableEventTypes: ['email.provider.alert.v1'],
        limitedCapability: true,
      },
    });
    render(<EmailConnectorsPage />);
    await waitFor(() => screen.getByText('M365 Defender Telemetry'));
    fireEvent.click(screen.getByRole('button', { name: /Test Connection/ }));
    await waitFor(() => expect(screen.getAllByText(EMAIL_COPY.SCOPE_UNAVAILABLE).length).toBeGreaterThan(0));
    expect(screen.getByText(/Test result: Not passed/)).toBeInTheDocument();
  });

  it('syncs with an empty body: the client never supplies events or counts', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            status: 'SYNCED',
            ingestedCount: 1,
            rejectedCount: 0,
            duplicateCount: 0,
            expectedCount: null,
            completenessGrade: 'UNKNOWN',
            gaps: [],
            windowStart: OBSERVED,
            windowEnd: OBSERVED,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await ZoikoShieldApiClient.syncEmailConnector('conn-1');
    const [, init] = fetchSpy.mock.calls[0];
    expect((init as RequestInit).body).toBe('{}');
  });

  it('shows evidence proof copy: unverified vs valid-with-gap (WF-09 / T15)', async () => {
    vi.spyOn(ZoikoShieldApiClient, 'verifyEmailEvidenceManifest').mockResolvedValue({
      verification: { verified: true, hasKnownGaps: true },
    });
    render(<EmailEvidencePage />);
    await waitFor(() => expect(screen.getByText(EMAIL_COPY.UNVERIFIED_PROOF)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Verify Pack' }));
    await waitFor(() =>
      expect(screen.getAllByText(new RegExp(EMAIL_COPY.VALID_PROOF_WITH_GAP.replace(/\./g, '\\.'))).length).toBeGreaterThan(1),
    );
  });

  it('shows the response-gate copy when Phase 2 is locked', async () => {
    render(<EmailActionsPage />);
    await waitFor(() =>
      expect(screen.getByText(new RegExp(EMAIL_COPY.RESPONSE_GATE.replace(/\./g, '\\.')))).toBeInTheDocument(),
    );
  });

  it('shows the AI-uncertain copy for an abstained analysis', async () => {
    render(<EmailAnalysisDetailPage />);
    await waitFor(() => expect(screen.getByText(EMAIL_COPY.AI_UNCERTAIN)).toBeInTheDocument());
  });

  it('setup wizard shows read-only consent copy and starts OAuth at the server-issued URL', async () => {
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, assign, origin: original.origin },
    });
    const intentSpy = vi.spyOn(ZoikoShieldApiClient, 'createEmailConnectionIntent').mockResolvedValue({
      intentId: 'intent-1',
      provider: 'MICROSOFT_365',
      status: 'CONSENT_PENDING',
      authorizationUrl: 'https://login.microsoftonline.com/authorize?state=server-made',
      requestedScopes: ['SecurityAlert.Read.All'],
      expiresAt: OBSERVED,
    });
    try {
      render(<EmailConnectorSetupPage />);
      await waitFor(() => screen.getByText(/Pending ADR-ZSSEC-01/));
      fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
      fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
      expect(screen.getAllByText(EMAIL_COPY.READ_ONLY_CONSENT).length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: /Continue/ })).toBeDisabled();
      fireEvent.click(screen.getByLabelText(/I have reviewed the requested permissions/));
      fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
      fireEvent.click(screen.getByRole('button', { name: /Continue to Microsoft 365 Defender consent/ }));
      await waitFor(() =>
        expect(assign).toHaveBeenCalledWith('https://login.microsoftonline.com/authorize?state=server-made'),
      );
      const payload = intentSpy.mock.calls[0][0] as Record<string, unknown>;
      expect(payload).not.toHaveProperty('oauthState');
      expect(payload).not.toHaveProperty('pkceChallengeHash');
      expect(payload.requestedScopes).toEqual(['SecurityAlert.Read.All']);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  // --------------------------------------------------------- OAuth callback
  it('callback relays code/state, stays not-active until a passing test, then activates', async () => {
    mockSearchParams = new URLSearchParams({ state: 'state-123', code: 'code-abc' });
    const cb = vi.spyOn(ZoikoShieldApiClient, 'completeEmailConnectionCallback');
    vi.spyOn(ZoikoShieldApiClient, 'testEmailConnector').mockResolvedValue({
      passed: true,
      status: 'HEALTHY',
      testedAt: OBSERVED,
      capabilityReport: {
        availableEventTypes: ['email.provider.alert.v1'],
        unavailableEventTypes: [],
        limitedCapability: false,
      },
    });
    const activate = vi
      .spyOn(ZoikoShieldApiClient, 'activateEmailConnector')
      .mockResolvedValue({ id: 'conn-1', status: 'ACTIVE', status_reason: null });

    render(<EmailConnectorCallbackPage />);
    await waitFor(() => expect(screen.getByText(EMAIL_STATE_COPY.HANDSHAKE_NOT_SUCCESS)).toBeInTheDocument());
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({
      state: 'state-123',
      code: 'code-abc',
      error: undefined,
      errorDescription: undefined,
    });
    expect(screen.queryByRole('button', { name: /Activate Source/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Test Connection/ }));
    await waitFor(() => screen.getByText(/Test result: Passed/));
    fireEvent.click(screen.getByRole('button', { name: /Activate Source/ }));
    await waitFor(() => expect(activate).toHaveBeenCalledWith('conn-1'));
    await waitFor(() => expect(screen.getByText(/Source status is now ACTIVE/)).toBeInTheDocument());
  });

  it('callback reports denied consent without connecting anything', async () => {
    mockSearchParams = new URLSearchParams({
      state: 'state-123',
      error: 'access_denied',
      error_description: 'Admin declined',
    });
    vi.spyOn(ZoikoShieldApiClient, 'completeEmailConnectionCallback').mockResolvedValue({
      intentId: 'intent-1',
      status: 'DENIED',
      connection: null,
    });
    render(<EmailConnectorCallbackPage />);
    await waitFor(() => expect(screen.getByText(/Consent was not granted/)).toBeInTheDocument());
    expect(screen.getByText(/Admin declined/)).toBeInTheDocument();
  });

  it('callback with no state does not call the backend', async () => {
    mockSearchParams = new URLSearchParams({ code: 'code-abc' });
    const cb = vi.spyOn(ZoikoShieldApiClient, 'completeEmailConnectionCallback');
    render(<EmailConnectorCallbackPage />);
    await waitFor(() => expect(screen.getByText(/did not include a state value/)).toBeInTheDocument());
    expect(cb).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------ E07 / 409
  it('sends expectedVersion and handles STALE_VERSION without losing the record (E07)', async () => {
    const detailSpy = vi.spyOn(ZoikoShieldApiClient, 'getEmailThreatDetail');
    const adj = vi
      .spyOn(ZoikoShieldApiClient, 'recordEmailAdjudication')
      .mockRejectedValue(
        new ZoikoShieldApiError('STALE_VERSION: finding changed', 409, '/api/v1/email/threats/threat-1/adjudications'),
      );
    render(<EmailThreatDetailPage />);
    await waitFor(() => screen.getByText('Record Analyst Adjudication'));
    const callsBefore = detailSpy.mock.calls.length;

    fireEvent.change(screen.getByLabelText('Rationale'), { target: { value: 'Verified header mismatch' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Adjudication/ }));

    await waitFor(() => expect(screen.getByText(EMAIL_STATE_COPY.STALE_VERSION)).toBeInTheDocument());
    expect(adj.mock.calls[0][1]).toMatchObject({ expectedVersion: 4, decision: 'CONFIRMED' });
    expect(detailSpy.mock.calls.length).toBeGreaterThan(callsBefore);
    expect((screen.getByLabelText('Rationale') as HTMLInputElement).value).toBe('Verified header mismatch');
  });

  it('analysis decision sends expectedVersion (E07)', async () => {
    const decide = vi.spyOn(ZoikoShieldApiClient, 'decideEmailAnalysis').mockResolvedValue({});
    render(<EmailAnalysisDetailPage />);
    await waitFor(() => screen.getByText('Human Reviewer Disposition'));
    fireEvent.click(screen.getByRole('button', { name: /Confirm Human Review/ }));
    await waitFor(() => expect(decide).toHaveBeenCalled());
    expect(decide.mock.calls[0][1]).toMatchObject({ expectedVersion: 2 });
  });

  // ------------------------------------------------------------------ T19
  it('switches displayed times between local and UTC without changing the evidence value (T19)', async () => {
    render(<EmailThreatDetailPage />);
    await waitFor(() => screen.getByText('Record Analyst Adjudication'));
    const toggle = screen.getByRole('button', { name: /Show times in UTC/ });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getAllByText(/08:15:30 UTC/).length).toBeGreaterThan(0));
    const times = Array.from(document.querySelectorAll('time'));
    expect(times.length).toBeGreaterThan(0);
    expect(times.every((t) => t.getAttribute('dateTime') === t.getAttribute('datetime'))).toBe(true);
    expect(times.some((t) => t.getAttribute('datetime') === OBSERVED)).toBe(true);
    expect(localStorage.getItem('zoiko_timezone_mode')).toBe('UTC');
    expect(screen.getByRole('button', { name: /Show times in local time/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  // ------------------------------------------------------------------ T21
  it('mobile threat cards keep severity, time, confidence and provenance visible (T21)', async () => {
    const prev = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    window.dispatchEvent(new Event('resize'));
    try {
      render(<EmailThreatQueuePage />);
      const card = await screen.findByTestId('threat-card');
      const c = within(card);
      expect(c.getByText(/Severity: HIGH/)).toBeInTheDocument();
      expect(card.querySelector(`time[datetime="${OBSERVED}"]`)).not.toBeNull();
      expect(c.getByText('HIGH', { selector: 'dd' })).toBeInTheDocument();
      expect(c.getByText(/evt-source-77/)).toBeInTheDocument();
      expect(c.getByRole('link', { name: /Investigate/ })).toHaveAttribute('href', '/email/threats/threat-1');
      expect(card.textContent).not.toMatch(/delete|pull back|quarantine/i);
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: prev });
    }
  });

  // ---------------------------------------------------------- WF-08 / WF-09
  it('coverage drill-down shows numerator, denominator and exclusions, and loads control evidence', async () => {
    const ev = vi.spyOn(ZoikoShieldApiClient, 'getEmailControlEvidence');
    render(<EmailControlCoveragePage />);
    await waitFor(() => screen.getByText('Anomaly monitoring'));
    expect(screen.getByText('3 of 4 (75.0%)')).toBeInTheDocument();
    expect(screen.getByText(/Consent expired/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /View Evidence/ }));
    await waitFor(() => expect(ev).toHaveBeenCalledWith('CC7.2'));
    await waitFor(() => expect(screen.getByText(/Evidence for CC7.2/)).toBeInTheDocument());
  });

  it('auditor grant requires choosing manifests and sends manifestIds (T09)', async () => {
    const grant = vi
      .spyOn(ZoikoShieldApiClient, 'grantEmailAuditorAccess')
      .mockResolvedValue({ expiresAt: '2099-01-01T00:00:00.000Z' });
    render(<EmailSettingsGovernancePage />);
    await waitFor(() => screen.getByText('External Auditor Access Grants'));
    await waitFor(() => screen.getByLabelText(/man-1/));
    fireEvent.change(screen.getByLabelText(/External auditor principal ID/), {
      target: { value: 'auditor-7' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Grant Bounded Access/ }));
    await waitFor(() =>
      expect(screen.getByText(/Select at least one evidence manifest/)).toBeInTheDocument(),
    );
    expect(grant).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/man-1/));
    fireEvent.click(screen.getByRole('button', { name: /Grant Bounded Access/ }));
    await waitFor(() => expect(grant).toHaveBeenCalled());
    expect(grant.mock.calls[0][0]).toEqual({
      auditorPrincipalId: 'auditor-7',
      expiresInHours: 24,
      manifestIds: ['man-1'],
    });
    const grantsTable = screen.getByRole('table', { name: /Auditor access grants/ });
    expect(within(grantsTable).getByText('Active')).toBeInTheDocument();
  });
});
