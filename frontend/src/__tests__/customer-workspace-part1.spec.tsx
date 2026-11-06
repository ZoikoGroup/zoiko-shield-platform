import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CustomerSecurityOverviewSection,
  CustomerThreatsIncidentsSection,
  CustomerExposureManagementSection,
  CustomerAssetsInventorySection,
  CustomerVulnerabilitiesSection,
  CustomerDetectionResponseSection,
  CustomerIdentityAccessSection,
} from '@/components/customer/CustomerWorkspaceViewsPart1';

/* ---------------------------------------------------------------------------
 * fetch mock: every section reads only through fetch, so tests describe the
 * backend by route and assert on what the page did with it.
 * ------------------------------------------------------------------------- */

interface Route {
  method?: string;
  path: string | RegExp;
  status?: number;
  body: unknown | (() => unknown);
}
interface Call {
  url: string;
  method: string;
  body: any;
}

function mockBackend(routes: Route[]) {
  const calls: Call[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = String(input);
    const method = String(init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    const path = url.split('?')[0];
    const route = routes.find(
      (r) =>
        (r.method ?? 'GET') === method &&
        (typeof r.path === 'string' ? r.path === path : r.path.test(path)),
    );
    if (!route) {
      return new Response(JSON.stringify({ message: `unmocked ${method} ${path}` }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    const payload = typeof route.body === 'function' ? (route.body as () => unknown)() : route.body;
    return new Response(JSON.stringify(payload), {
      status: route.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  return calls;
}

afterEach(() => {
  vi.restoreAllMocks();
});

const NOW = Date.now();
const ago = (hours: number) => new Date(NOW - hours * 3600_000).toISOString();
const wrap = (data: unknown) => ({ statusCode: 200, data });

const SESSION = {
  id: 'user-1',
  email: 'owner@example.test',
  fullName: 'Owner',
  tenantId: 'tenant-1',
  environmentId: 'env-1',
  region: 'eu-west-1',
};

function finding(over: Record<string, unknown>) {
  return {
    id: 'f-x',
    asset_id: null,
    asset_external_ref: null,
    source_system: 'aws',
    finding_type: 'EXPOSURE',
    title: 'Finding',
    description: null,
    vulnerability_ref: null,
    severity: 'HIGH',
    status: 'OPEN',
    priority_score: 5,
    first_detected_at: ago(48),
    last_confirmed_at: ago(1),
    resolved_at: null,
    acceptance: null,
    assertion: { state: 'CURRENT', reason: 'Confirmed 1h ago, within the 24h interval.' },
    ...over,
  };
}

const FINDINGS = [
  finding({ id: 'f-1', finding_type: 'EXPOSURE', title: 'Storage bucket publicly readable', severity: 'CRITICAL', priority_score: 9.5, description: 'Customer-exports bucket.' }),
  finding({ id: 'f-2', finding_type: 'VULNERABILITY', title: 'OpenSSL buffer overflow', severity: 'CRITICAL', vulnerability_ref: 'CVE-2026-1001', priority_score: 9.1, source_system: 'qa-scanner' }),
  finding({ id: 'f-3', finding_type: 'MISCONFIGURATION', title: 'Security group allows SSH from anywhere', severity: 'HIGH', priority_score: 8, asset_id: 'a-1', asset_external_ref: 'i-0abc123' }),
  finding({ id: 'f-4', finding_type: 'VULNERABILITY', title: 'Outdated nginx', severity: 'HIGH', vulnerability_ref: 'CVE-2026-2002', status: 'ACCEPTED' }),
  finding({ id: 'f-5', finding_type: 'VULNERABILITY', title: 'Old TLS enabled', severity: 'LOW', vulnerability_ref: 'CVE-2026-3003', status: 'RESOLVED' }),
];

const SUMMARY = {
  generatedAt: ago(0),
  metrics: { total: 5, open: 3, staleAssertions: 1, ageingAssertions: 2, unscored: 0, scoredOverUnknowns: 0, unresolvedAsset: 2, accepted: 1, resolved: 1 },
  openBySeverity: { CRITICAL: 2, HIGH: 1 },
  openByType: { EXPOSURE: 1, VULNERABILITY: 1, MISCONFIGURATION: 1 },
};
const EMPTY_SUMMARY = {
  generatedAt: ago(0),
  metrics: { total: 0, open: 0, staleAssertions: 0, ageingAssertions: 0, unscored: 0, scoredOverUnknowns: 0, unresolvedAsset: 0, accepted: 0, resolved: 0 },
  openBySeverity: {},
  openByType: {},
};

const ASSETS = [
  { id: 'a-1', external_id: 'i-0abc123', asset_type: 'SERVER', name: 'web-prod-01', criticality: 'HIGH', status: 'ACTIVE', first_seen_at: ago(2), last_seen_at: ago(2), aliases: [{ source_system: 'aws', external_id: 'i-0abc123' }] },
  { id: 'a-2', external_id: 'laptop-77', asset_type: 'ENDPOINT', name: 'lt-finance-07', criticality: null, status: 'ACTIVE', first_seen_at: ago(400), last_seen_at: ago(400), aliases: [{ source_system: 'intune', external_id: 'laptop-77' }] },
];

const ALERTS = [
  { id: 'al-1', title: 'Suspicious sign-in from new country', description: 'Owner signed in from a new country.', severity: 'CRITICAL', priority: 'P1', confidence: 0.9, status: 'NEW', detection_definition_id: 'def-id', coverage_state: 'COMPLETE', incomplete_data: false, primary_asset_id: null, primary_identity_id: null, assigned_to: null, created_at: ago(2), updated_at: ago(1), acknowledged_at: null, resolved_at: null },
  { id: 'al-2', title: 'Encoded PowerShell launched by Office', description: null, severity: 'HIGH', priority: 'P2', confidence: 0.9, status: 'TRIAGED', detection_definition_id: 'def-proc', coverage_state: 'COMPLETE', incomplete_data: false, primary_asset_id: null, primary_identity_id: null, assigned_to: null, created_at: ago(24), updated_at: ago(1), acknowledged_at: null, resolved_at: null },
  { id: 'al-3', title: 'Root account API call', description: null, severity: 'HIGH', priority: 'P2', confidence: 0.9, status: 'CLOSED', detection_definition_id: 'def-cloud', coverage_state: 'COMPLETE', incomplete_data: false, primary_asset_id: null, primary_identity_id: null, assigned_to: null, created_at: ago(200), updated_at: ago(1), acknowledged_at: null, resolved_at: ago(1) },
];

const CASE = {
  id: 'case-1111-aaaa',
  title: 'Investigate suspicious sign-in',
  description: 'Raised from the QA flow.',
  severity: 'HIGH',
  priority: 'P2',
  status: 'NEW',
  owner_id: null,
  queue_id: 'DEFAULT',
  created_at: ago(3),
  updated_at: ago(3),
  resolved_at: null,
  closed_at: null,
};

const PROPOSAL = {
  id: 'prop-1',
  case_id: CASE.id,
  alert_id: null,
  target_type: 'IDENTITY',
  target_id: 'alice@example.test',
  action_type: 'REVOKE_SESSIONS',
  reason: 'Credential theft suspected',
  authority_level: 'R2',
  requested_by: 'analyst-1',
  recommendation_source: 'HUMAN',
  reversible: true,
  status: 'PROPOSED',
  expires_at: new Date(NOW + 3600_000).toISOString(),
  created_at: ago(1),
};

const DEFINITIONS = [
  { id: 'def-id', key: 'SUSPICIOUS_LOGIN_NEW_LOCATION', name: 'Suspicious sign-in', description: null, owner: 'platform', category: 'IDENTITY', status: 'ACTIVE', versions: [{ id: 'v1', status: 'PUBLISHED', version: 1, severity: 'HIGH' }] },
  { id: 'def-proc', key: 'ZS-PROC-001', name: 'Suspicious process execution', description: null, owner: 'platform', category: 'ENDPOINT', status: 'ACTIVE', versions: [{ id: 'v2', status: 'PUBLISHED', version: 3, severity: 'CRITICAL' }] },
  { id: 'def-cloud', key: 'ZS-CLOUD-001', name: 'Cloud privilege escalation', description: null, owner: 'platform', category: 'CLOUD_INFRA', status: 'DRAFT', versions: [] },
];

const IDENTITIES = [
  { id: 'id-1', external_id: 'u-1001', email: 'alice@example.test', display_name: 'Alice Admin', identity_type: 'HUMAN', status: 'ACTIVE', confidence: 1, first_seen_at: ago(5), last_seen_at: ago(5), aliases: [{ source_system: 'entra', external_id: 'u-1001' }] },
  { id: 'id-2', external_id: 'svc-backup', email: 'svc-backup@example.test', display_name: 'Backup service', identity_type: 'SERVICE_ACCOUNT', status: 'ACTIVE', confidence: 1, first_seen_at: ago(5), last_seen_at: ago(5), aliases: [] },
];

const JIT = [
  { id: 'jit-1', superAdminPrincipalId: 'op123456-0000', targetTenantId: 'tenant-1', statedPurpose: 'Investigate connector outage', requestedDurationMinutes: 45, roleCode: 'TENANT_SECURITY_ANALYST', status: 'PENDING', approvedByPrincipalId: null, rejectionReason: null, approvedAt: null, expiresAt: null, createdAt: ago(1) },
  { id: 'jit-2', superAdminPrincipalId: 'op999999-0000', targetTenantId: 'tenant-1', statedPurpose: 'Restore detection pipeline', requestedDurationMinutes: 60, roleCode: 'TENANT_SECURITY_ANALYST', status: 'APPROVED', approvedByPrincipalId: 'op2', rejectionReason: null, approvedAt: ago(0.2), expiresAt: new Date(NOW + 1800_000).toISOString(), createdAt: ago(0.5) },
];

const RUNS = [
  { id: 'run-1', caseId: 'case-1111-aaaa', playbookKey: 'isolate-endpoint', playbookOwner: 'platform', version: 2, mode: 'LIVE', status: 'COMPLETED', triggeredBy: 'analyst-1', startedAt: ago(4), completedAt: ago(3.9), terminationReason: null },
];

const ME = { path: '/api/v1/auth/me', body: SESSION };

/* ============================================================================ */

describe('Security Overview', () => {
  it('renders findings, inventory, controls and connector health from the backend', async () => {
    mockBackend([
      ME,
      { path: '/api/v1/findings/summary', body: wrap(SUMMARY) },
      { path: '/api/v1/findings', body: wrap(FINDINGS) },
      { path: '/api/v1/context/assets', body: wrap(ASSETS) },
      { path: '/api/v1/reporting/assurance', body: { generatedAt: ago(0), healthState: 'OK', metrics: { controlsEffective: 3, controlsPartiallyEffective: 1, controlsIneffective: 0, controlsUnknown: 0, evidenceGapsOpen: 0, activeRisks: 0, activeExceptions: 0, expiredRiskAcceptances: 0, expiredExceptions: 0 } } },
      { path: '/api/v1/reporting/service-health', body: { generatedAt: ago(0), connectorHealth: { healthy: 2, total: 3 }, overallHealth: 'DEGRADED', aiAvailability: 'UNKNOWN', actionSimulationHealth: 'UNKNOWN', evidenceLedgerHealth: 'UNKNOWN', anchorHealth: 'UNKNOWN' } },
    ]);
    render(<CustomerSecurityOverviewSection />);

    expect(screen.getByText('Security Overview')).toBeInTheDocument();
    expect(await screen.findByText('2 critical • 1 high')).toBeInTheDocument();
    expect(await screen.findByText('75%')).toBeInTheDocument();
    expect(screen.getByText('3 of 4 assessed controls')).toBeInTheDocument();
    expect(await screen.findByText('Storage bucket publicly readable')).toBeInTheDocument();
    expect(screen.getByText('OpenSSL buffer overflow')).toBeInTheDocument();
    // Accepted / resolved findings are not posture drivers.
    expect(screen.queryByText('Outdated nginx')).not.toBeInTheDocument();
    expect(await screen.findByText('2 of 3 connectors healthy')).toBeInTheDocument();
    expect(screen.getByText('1 stale • 2 ageing finding assertions')).toBeInTheDocument();
    expect(screen.getByText('Total: 2 assets across 2 types')).toBeInTheDocument();
    expect(screen.getByText('1 rated critical or high')).toBeInTheDocument();

    // The asset scope filter genuinely narrows the inventory table.
    fireEvent.change(screen.getByLabelText('Asset scope filter'), { target: { value: 'SERVER' } });
    const table = screen.getByText('Asset type').closest('table')!;
    expect(within(table).getByText('Server')).toBeInTheDocument();
    expect(within(table).queryByText('Endpoint')).not.toBeInTheDocument();
  });

  it('shows honest empty states when the tenant has no data', async () => {
    mockBackend([
      ME,
      { path: '/api/v1/findings/summary', body: wrap(EMPTY_SUMMARY) },
      { path: '/api/v1/findings', body: wrap([]) },
      { path: '/api/v1/context/assets', body: wrap([]) },
      { path: '/api/v1/reporting/assurance', body: { generatedAt: ago(0), healthState: 'UNKNOWN', metrics: { controlsEffective: 0, controlsPartiallyEffective: 0, controlsIneffective: 0, controlsUnknown: 0, evidenceGapsOpen: 0, activeRisks: 0, activeExceptions: 0, expiredRiskAcceptances: 0, expiredExceptions: 0 } } },
      { path: '/api/v1/reporting/service-health', body: { generatedAt: ago(0), connectorHealth: { healthy: 0, total: 0 }, overallHealth: 'UNKNOWN' } },
    ]);
    render(<CustomerSecurityOverviewSection />);

    expect(await screen.findByText(/No assets yet\./)).toBeInTheDocument();
    expect(await screen.findByText(/No open findings\. Findings appear when a scanner/)).toBeInTheDocument();
    expect(await screen.findByText('No controls assessed yet')).toBeInTheDocument();
    expect(await screen.findByText('No connectors configured')).toBeInTheDocument();
  });

  it('shows the backend error instead of zeros when a call fails', async () => {
    mockBackend([
      ME,
      { path: '/api/v1/findings/summary', status: 500, body: { message: 'findings store offline' } },
      { path: '/api/v1/findings', status: 500, body: { message: 'findings store offline' } },
      { path: '/api/v1/context/assets', body: wrap([]) },
    ]);
    render(<CustomerSecurityOverviewSection />);
    expect((await screen.findAllByText(/findings store offline/)).length).toBeGreaterThan(0);
  });
});

describe('Threats & Incidents', () => {
  function threatRoutes(cases: () => unknown[], extra: Route[] = []): Route[] {
    return [
      ...extra,
      ME,
      { path: '/api/v1/cases', body: () => wrap(cases()) },
      { path: '/api/v1/alerts', body: wrap(ALERTS) },
      { path: '/api/v1/reporting/security', body: { generatedAt: ago(0), metrics: { openAlerts: 2, criticalAlerts: 1, openCases: 1, casesAwaitingCustomer: 4 } } },
      { path: /\/api\/v1\/cases\/[^/]+\/response-proposals$/, body: { statusCode: 200, proposals: [PROPOSAL] } },
      { path: /\/api\/v1\/cases\/[^/]+\/timeline$/, body: wrap([{ id: 't1', title: 'Case created', summary: null, occurred_at: ago(3) }]) },
      { path: /\/api\/v1\/cases\/[^/]+\/evidence$/, body: wrap([]) },
    ];
  }

  it('renders cases, untriaged alerts, approvals and timeline from the backend', async () => {
    mockBackend(threatRoutes(() => [CASE]));
    render(<CustomerThreatsIncidentsSection />);

    expect(screen.getByText('Threats & Incidents')).toBeInTheDocument();
    expect((await screen.findAllByText('Investigate suspicious sign-in')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Suspicious sign-in from new country')).toBeInTheDocument();
    expect(screen.getByText('Of 2 open alerts')).toBeInTheDocument();
    expect(await screen.findByText('4')).toBeInTheDocument(); // casesAwaitingCustomer
    expect(await screen.findByText('Case created', { exact: false })).toBeInTheDocument();
    expect(await screen.findByText('Revoke sessions')).toBeInTheDocument();
    expect(screen.getByText('Credential theft suspected')).toBeInTheDocument();
  });

  it('creates an incident with the right body, then refreshes the queue', async () => {
    let cases: unknown[] = [];
    const calls = mockBackend(
      threatRoutes(() => cases, [
        {
          method: 'POST',
          path: '/api/v1/cases',
          status: 201,
          body: () => {
            const created = { ...CASE, id: 'case-new', title: 'Phishing wave', severity: 'CRITICAL' };
            cases = [created];
            return { statusCode: 201, data: created };
          },
        },
      ]),
    );
    render(<CustomerThreatsIncidentsSection />);
    expect(await screen.findByText(/No incidents yet/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('+ Create incident'));
    fireEvent.change(screen.getByLabelText('Incident title'), { target: { value: 'Phishing wave' } });
    fireEvent.change(screen.getByLabelText('Incident description'), { target: { value: 'Many users reported it' } });
    fireEvent.change(screen.getByLabelText('New incident severity'), { target: { value: 'CRITICAL' } });
    fireEvent.click(screen.getByText('Create'));

    expect(await screen.findByText('Incident "Phishing wave" created.')).toBeInTheDocument();
    const post = calls.find((c) => c.method === 'POST' && c.url === '/api/v1/cases');
    expect(post?.body).toEqual({
      title: 'Phishing wave',
      description: 'Many users reported it',
      severity: 'CRITICAL',
      environmentId: 'env-1',
      region: 'eu-west-1',
    });
    expect((await screen.findAllByText('Phishing wave')).length).toBeGreaterThan(0);
    expect(calls.filter((c) => c.method === 'GET' && c.url.startsWith('/api/v1/cases?')).length).toBeGreaterThanOrEqual(2);
  });

  it('shows the backend error and no success when creating fails', async () => {
    mockBackend(
      threatRoutes(() => [], [
        { method: 'POST', path: '/api/v1/cases', status: 400, body: { message: 'A case requires either alertId, or title + environmentId + region' } },
      ]),
    );
    render(<CustomerThreatsIncidentsSection />);
    fireEvent.click(screen.getByText('+ Create incident'));
    fireEvent.change(screen.getByLabelText('Incident title'), { target: { value: 'Broken' } });
    fireEvent.click(screen.getByText('Create'));

    expect(await screen.findByText(/A case requires either alertId/)).toBeInTheDocument();
    expect(screen.queryByText(/created\./)).not.toBeInTheDocument();
  });

  it('moves an alert only to a valid next state via PATCH /alerts/:id/status', async () => {
    const calls = mockBackend(
      threatRoutes(() => [CASE], [
        { method: 'PATCH', path: '/api/v1/alerts/al-1/status', body: wrap({ ...ALERTS[0], status: 'ACKNOWLEDGED' }) },
      ]),
    );
    render(<CustomerThreatsIncidentsSection />);
    fireEvent.click(screen.getByRole('tab', { name: 'Alerts' }));
    const select = await screen.findByLabelText('Change status of Suspicious sign-in from new country');
    const options = within(select).getAllByRole('option').map((o) => o.getAttribute('value'));
    expect(options).toEqual(['', 'ACKNOWLEDGED', 'SUPPRESSED', 'FALSE_POSITIVE', 'DUPLICATE']);
    // A closed alert offers no transitions at all.
    expect(screen.queryByLabelText('Change status of Root account API call')).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'ACKNOWLEDGED' } });
    expect(await screen.findByText(/moved to Acknowledged/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ status: 'ACKNOWLEDGED' });
  });

  it('approves a pending response proposal with a human-authority attestation', async () => {
    const calls = mockBackend(
      threatRoutes(() => [CASE], [
        { method: 'POST', path: '/api/v1/response-proposals/prop-1/approve', body: wrap({ id: 'appr-1' }) },
      ]),
    );
    render(<CustomerThreatsIncidentsSection />);
    fireEvent.click(await screen.findByText('Review & approve'));
    fireEvent.change(screen.getByLabelText('Authority statement'), {
      target: { value: 'Approved as incident lead for this case' },
    });
    fireEvent.click(screen.getByLabelText('I am making this decision myself.'));
    fireEvent.click(screen.getByText('Approve action'));

    expect(await screen.findByText('Approved: Revoke sessions.')).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/approve'))?.body).toEqual({
      reason: 'Approved as incident lead for this case',
      humanAuthority: {
        decisionOrigin: 'HUMAN',
        humanConfirmation: true,
        authorityStatement: 'Approved as incident lead for this case',
      },
    });
  });
});

describe('Exposure Management', () => {
  const routes = (findings: unknown[], extra: Route[] = []): Route[] => [
    ...extra,
    { path: '/api/v1/findings', body: wrap(findings) },
  ];

  it('lists exposure and misconfiguration findings from the backend', async () => {
    const calls = mockBackend(routes(FINDINGS.filter((f) => ['EXPOSURE', 'MISCONFIGURATION'].includes(f.finding_type))));
    render(<CustomerExposureManagementSection />);

    expect(screen.getByText('Exposure Management')).toBeInTheDocument();
    expect((await screen.findAllByText('Storage bucket publicly readable')).length).toBeGreaterThan(0);
    expect(screen.getByText('Security group allows SSH from anywhere')).toBeInTheDocument();
    expect(screen.getByText('1 critical • 1 high')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument(); // asset linkage
    expect(screen.getByText('Customer-exports bucket.')).toBeInTheDocument();
    expect(calls[0].url).toContain('type=EXPOSURE%2CMISCONFIGURATION');
  });

  it('shows the empty state when there are no exposures', async () => {
    mockBackend(routes([]));
    render(<CustomerExposureManagementSection />);
    expect(await screen.findByText(/No exposure findings yet/)).toBeInTheDocument();
  });

  it('records a risk acceptance with rationale, authority and expiry', async () => {
    const calls = mockBackend(
      routes([FINDINGS[0]], [
        { method: 'POST', path: '/api/v1/findings/f-1/accept', status: 201, body: { statusCode: 201, data: { id: 'acc-1' } } },
      ]),
    );
    render(<CustomerExposureManagementSection />);
    fireEvent.click(await screen.findByText('Accept risk…'));
    fireEvent.change(screen.getByLabelText('Acceptance rationale'), { target: { value: 'Bucket holds public docs only' } });
    fireEvent.change(screen.getByLabelText('Accepting authority'), { target: { value: 'CISO' } });
    fireEvent.change(screen.getByLabelText('Acceptance expires on'), { target: { value: '2099-01-31' } });
    fireEvent.click(screen.getByText('Record acceptance'));

    expect(await screen.findByText(/Risk accepted for "Storage bucket publicly readable"/)).toBeInTheDocument();
    const body = calls.find((c) => c.method === 'POST')?.body;
    expect(body.rationale).toBe('Bucket holds public docs only');
    expect(body.authority).toBe('CISO');
    expect(body.expiresAt).toMatch(/^2099-01-31T|^2099-02-01T/);
  });
});

describe('Assets & Inventory', () => {
  it('renders the inventory from the backend with real type counts', async () => {
    mockBackend([{ path: '/api/v1/context/assets', body: wrap(ASSETS) }]);
    render(<CustomerAssetsInventorySection />);

    expect(screen.getByText('Assets & Inventory')).toBeInTheDocument();
    expect(await screen.findByText('web-prod-01')).toBeInTheDocument();
    expect(screen.getByText('lt-finance-07')).toBeInTheDocument();
    expect(screen.getByText('All 2')).toBeInTheDocument();
    expect(screen.getByText('Server 1')).toBeInTheDocument();
    expect(screen.getByText('Set criticality on 1 assets')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Server 1'));
    expect(screen.queryByText('lt-finance-07')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 2 assets')).toBeInTheDocument();
  });

  it('shows the empty state when there are no assets', async () => {
    mockBackend([{ path: '/api/v1/context/assets', body: wrap([]) }]);
    render(<CustomerAssetsInventorySection />);
    expect(await screen.findByText(/No assets yet\. Assets appear when a connector reports them/)).toBeInTheDocument();
  });

  it('adds an asset via POST /context/assets/resolve and refreshes the list', async () => {
    let assets: unknown[] = [];
    const calls = mockBackend([
      {
        method: 'POST',
        path: '/api/v1/context/assets/resolve',
        body: () => {
          assets = [{ ...ASSETS[0], id: 'a-new', name: 'core-api-09', external_id: 'core-api-09', criticality: 'CRITICAL' }];
          return wrap({ assetId: 'a-new', decision: 'CREATED' });
        },
      },
      { path: '/api/v1/context/assets', body: () => wrap(assets) },
    ]);
    render(<CustomerAssetsInventorySection />);
    await screen.findByText(/No assets yet/);

    fireEvent.click(screen.getByText('+ Add asset'));
    fireEvent.change(screen.getByLabelText('Asset hostname'), { target: { value: 'core-api-09' } });
    fireEvent.change(screen.getByLabelText('Asset type'), { target: { value: 'SERVER' } });
    fireEvent.change(screen.getByLabelText('Asset criticality'), { target: { value: 'CRITICAL' } });
    fireEvent.click(screen.getByText('Save asset'));

    expect(await screen.findByText('Asset "core-api-09" added to your inventory.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      externalId: 'core-api-09',
      assetType: 'SERVER',
      hostname: 'core-api-09',
      criticality: 'CRITICAL',
    });
    expect((await screen.findAllByText('core-api-09')).length).toBeGreaterThan(0);
  });

  it('shows the backend error when adding an asset fails', async () => {
    mockBackend([
      { method: 'POST', path: '/api/v1/context/assets/resolve', status: 400, body: { message: 'externalId should not be empty' } },
      { path: '/api/v1/context/assets', body: wrap([]) },
    ]);
    render(<CustomerAssetsInventorySection />);
    fireEvent.click(screen.getByText('+ Add asset'));
    fireEvent.change(screen.getByLabelText('Asset hostname'), { target: { value: 'x' } });
    fireEvent.click(screen.getByText('Save asset'));
    expect(await screen.findByText('externalId should not be empty')).toBeInTheDocument();
    expect(screen.queryByText(/added to your inventory/)).not.toBeInTheDocument();
  });
});

describe('Vulnerabilities', () => {
  it('lists VULNERABILITY findings with their CVE and filters by tab', async () => {
    const calls = mockBackend([
      { path: '/api/v1/findings', body: wrap(FINDINGS.filter((f) => f.finding_type === 'VULNERABILITY')) },
    ]);
    render(<CustomerVulnerabilitiesSection />);

    expect(screen.getByText('Vulnerabilities')).toBeInTheDocument();
    expect(await screen.findByText('CVE-2026-1001')).toBeInTheDocument();
    expect(screen.queryByText('CVE-2026-2002')).not.toBeInTheDocument(); // accepted: not in the open view
    expect(calls[0].url).toContain('type=VULNERABILITY');

    fireEvent.click(screen.getByRole('tab', { name: 'Exceptions' }));
    expect(screen.getByText('CVE-2026-2002')).toBeInTheDocument();
    expect(screen.queryByText('CVE-2026-1001')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'CVE Findings' }));
    expect(screen.getByText('CVE-2026-3003')).toBeInTheDocument();
  });

  it('shows the empty state when there are no vulnerability findings', async () => {
    mockBackend([{ path: '/api/v1/findings', body: wrap([]) }]);
    render(<CustomerVulnerabilitiesSection />);
    expect(
      await screen.findByText(
        'No vulnerability findings yet. Findings appear when a scanner or cloud connector reports them — see Integrations.',
      ),
    ).toBeInTheDocument();
  });
});

describe('Detection & Response', () => {
  it('renders the rule catalogue, alert counts, playbook runs and approvals', async () => {
    mockBackend([
      ME,
      { path: '/api/v1/detections/definitions', body: wrap(DEFINITIONS) },
      { path: '/api/v1/alerts', body: wrap(ALERTS) },
      { path: '/api/v1/playbooks/runs', body: RUNS },
      { path: '/api/v1/cases', body: wrap([CASE]) },
      { path: /\/api\/v1\/cases\/[^/]+\/response-proposals$/, body: { statusCode: 200, proposals: [PROPOSAL] } },
    ]);
    render(<CustomerDetectionResponseSection />);

    expect(screen.getByText('Detection & Response')).toBeInTheDocument();
    expect(await screen.findByText('Suspicious process execution')).toBeInTheDocument();
    expect(screen.getByText('Of 3 defined rules')).toBeInTheDocument();
    expect(screen.getByText('v3 • Critical')).toBeInTheDocument();
    expect(screen.getByText('None published')).toBeInTheDocument();
    expect(await screen.findByText('isolate-endpoint')).toBeInTheDocument();
    expect(await screen.findByText('Revoke sessions')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Execution history' }));
    expect(screen.queryByText('Suspicious process execution')).not.toBeInTheDocument();
    expect(screen.getByText('isolate-endpoint')).toBeInTheDocument();
  });

  it('shows empty states when nothing is defined or has run', async () => {
    mockBackend([
      ME,
      { path: '/api/v1/detections/definitions', body: wrap([]) },
      { path: '/api/v1/alerts', body: wrap([]) },
      { path: '/api/v1/playbooks/runs', body: [] },
      { path: '/api/v1/cases', body: wrap([]) },
    ]);
    render(<CustomerDetectionResponseSection />);
    expect(await screen.findByText('No detection rules defined for this tenant.')).toBeInTheDocument();
    expect(await screen.findByText('No response playbooks have run for this tenant.')).toBeInTheDocument();
    expect(await screen.findByText('No response actions are awaiting approval.')).toBeInTheDocument();
  });
});

describe('Identity & Access', () => {
  it('renders identities, identity alerts and operator elevations from the backend', async () => {
    const calls = mockBackend([
      ME,
      { path: '/api/v1/context/identities', body: wrap(IDENTITIES) },
      { path: '/api/v1/detections/definitions', body: wrap(DEFINITIONS) },
      { path: '/api/v1/alerts', body: wrap(ALERTS) },
      { path: '/api/v1/tenants/tenant-1/jit-audit', body: JIT },
    ]);
    render(<CustomerIdentityAccessSection />);

    expect(screen.getByText('Identity & Access')).toBeInTheDocument();
    expect(await screen.findByText('1 human • 1 non-human')).toBeInTheDocument();
    // Only the alert from the IDENTITY-category rule counts as an identity risk.
    expect(await screen.findByText('Suspicious sign-in from new country')).toBeInTheDocument();
    expect(screen.queryByText('Encoded PowerShell launched by Office')).not.toBeInTheDocument();
    expect((await screen.findAllByText('Investigate connector outage')).length).toBeGreaterThan(0);
    expect(screen.getByText('Restore detection pipeline')).toBeInTheDocument();
    expect(screen.getByText('1 active • 1 pending')).toBeInTheDocument();
    expect(calls.some((c) => c.url === '/api/v1/tenants/tenant-1/jit-audit')).toBe(true);

    fireEvent.click(screen.getByRole('tab', { name: 'Identities' }));
    expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    expect(screen.getByText('Backup service')).toBeInTheDocument();
  });

  it('shows empty states when there are no identities or elevations', async () => {
    mockBackend([
      ME,
      { path: '/api/v1/context/identities', body: wrap([]) },
      { path: '/api/v1/detections/definitions', body: wrap([]) },
      { path: '/api/v1/alerts', body: wrap([]) },
      { path: '/api/v1/tenants/tenant-1/jit-audit', body: [] },
    ]);
    render(<CustomerIdentityAccessSection />);
    expect(await screen.findByText('No operator has requested elevated access to your tenant.')).toBeInTheDocument();
    expect(await screen.findByText('No open identity alerts.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Identities' }));
    expect(await screen.findByText(/No identities yet\./)).toBeInTheDocument();
  });
});
