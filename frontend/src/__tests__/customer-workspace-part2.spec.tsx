import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CustomerDataSecuritySection,
  CustomerCloudSecuritySection,
  CustomerComplianceRiskSection,
  CustomerReportsAnalyticsSection,
  CustomerIntegrationsSection,
  CustomerSettingsSection,
} from '@/components/customer/CustomerWorkspaceViewsPart2';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/customer',
  useSearchParams: () => new URLSearchParams(),
}));

/* ---------------------------------------------------------------- fetch mock */

interface Route {
  method?: string;
  path: string;
  status?: number;
  body: unknown;
}

const TENANT_ID = 't-1';
const ENV_ID = 'env-1';

const SESSION = {
  id: 'p-1',
  email: 'owner@example.test',
  fullName: 'Owner',
  tenantId: TENANT_ID,
  environmentId: ENV_ID,
  region: 'eu-west-1',
  assurance: 'PASSWORD',
};

const TENANT = {
  id: TENANT_ID,
  name: 'Northwind Test Org',
  slug: 'northwind-test',
  status: 'ACTIVE',
  homeRegion: 'eu-west-1',
  dataResidencyRegion: 'eu-west-1',
  timezone: 'Asia/Kolkata',
  dataClass: 'STANDARD',
  retentionPolicyRef: 'default',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-02T10:00:00.000Z',
};

const baseRoutes: Route[] = [
  { path: '/api/v1/auth/me', body: SESSION },
  { path: `/api/v1/tenants/${TENANT_ID}`, body: TENANT },
];

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function mockBackend(routes: Route[]) {
  const all = [...routes, ...baseRoutes];
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.split('?')[0];
    const method = (init?.method ?? 'GET').toUpperCase();
    const route = all.find((r) => (r.method ?? 'GET') === method && r.path === path);
    if (!route) return respond({ message: `unmocked ${method} ${path}` }, 404);
    return respond(route.body, route.status ?? 200);
  });
}

function callsTo(spy: ReturnType<typeof mockBackend>, method: string, path: string) {
  return spy.mock.calls.filter(([input, init]) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    return url.split('?')[0] === path && ((init as RequestInit | undefined)?.method ?? 'GET') === method;
  });
}

function kpiValue(label: string) {
  const el = screen
    .getAllByText(label)
    .find((node) => node.tagName === 'DIV' && node.className.includes('text-xs font-medium'));
  return el?.nextElementSibling?.textContent;
}

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ fixtures */

function finding(overrides: Record<string, unknown>) {
  return {
    id: 'f',
    asset_id: null,
    asset_external_ref: null,
    source_system: 'aws',
    finding_type: 'EXPOSURE',
    title: 'Finding',
    description: null,
    vulnerability_ref: null,
    severity: 'HIGH',
    status: 'OPEN',
    priority_score: 7,
    first_detected_at: '2026-11-04T10:00:00.000Z',
    last_confirmed_at: '2026-11-05T10:00:00.000Z',
    resolved_at: null,
    acceptance: null,
    assertion: { state: 'CURRENT', reason: 'Confirmed 1h ago, within the 24h interval.' },
    ...overrides,
  };
}

const FINDINGS = [
  finding({ id: 'f1', title: 'Storage bucket publicly readable', severity: 'CRITICAL' }),
  finding({ id: 'f2', title: 'Admin accounts without MFA', finding_type: 'WEAKNESS', source_system: 'entra', severity: 'MEDIUM' }),
  finding({ id: 'f3', title: 'OpenSSL buffer overflow', finding_type: 'VULNERABILITY', source_system: 'qa-scanner' }),
  finding({ id: 'f4', title: 'Security group allows SSH', finding_type: 'MISCONFIGURATION', source_system: 'aws' }),
  finding({ id: 'f5', title: 'Scanner misconfiguration', finding_type: 'MISCONFIGURATION', source_system: 'qa-scanner' }),
  finding({ id: 'f6', title: 'Old public share', status: 'RESOLVED' }),
];

const ALERTS = [
  {
    id: 'a1',
    title: 'Public S3 bucket policy applied',
    description: null,
    severity: 'MEDIUM',
    priority: 'P3',
    confidence: 0.9,
    status: 'NEW',
    detection_definition_id: 'd1',
    coverage_state: 'COMPLETE',
    incomplete_data: false,
    primary_asset_id: null,
    primary_identity_id: null,
    assigned_to: null,
    created_at: '2026-11-05T09:00:00.000Z',
    updated_at: '2026-11-05T09:00:00.000Z',
    acknowledged_at: null,
    resolved_at: null,
  },
];

const CONNECTOR_TYPES = [
  {
    id: 'aws-cloudtrail',
    name: 'AWS CloudTrail',
    category: 'Cloud Infrastructure',
    description: 'Ingest AWS API activity logs',
    supportedAuthTypes: ['SERVICE_ACCOUNT', 'API_KEY'],
  },
  {
    id: 'okta-identity',
    name: 'Okta',
    category: 'Identity / Productivity',
    description: 'Collect Okta identity events',
    supportedAuthTypes: ['API_KEY'],
  },
];

const CONNECTORS = [
  {
    id: 'c1',
    name: 'Prod CloudTrail',
    state: 'DEGRADED',
    authentication_type: 'SERVICE_ACCOUNT',
    source_region: 'eu-west-1',
    createdAt: '2026-11-03T10:00:00.000Z',
    definition: { provider: 'aws-cloudtrail' },
  },
];

/* ------------------------------------------------------------- data security */

describe('Data Security', () => {
  it('shows exposure and weakness findings, data-store assets and alerts from the backend', async () => {
    mockBackend([
      { path: '/api/v1/findings', body: { data: FINDINGS } },
      { path: '/api/v1/alerts', body: { data: ALERTS } },
      { path: '/api/v1/detections/definitions', body: [{ id: 'd1', key: 'k', name: 'n', category: 'CLOUD_INFRA', status: 'ACTIVE' }] },
      {
        path: '/api/v1/context/assets',
        body: {
          data: [
            { id: 's1', external_id: 'bkt', asset_type: 'S3_BUCKET', name: 'customer-exports', criticality: 'HIGH', status: 'ACTIVE', first_seen_at: '', last_seen_at: '' },
            { id: 's2', external_id: 'lt', asset_type: 'ENDPOINT', name: 'laptop', criticality: 'LOW', status: 'ACTIVE', first_seen_at: '', last_seen_at: '' },
          ],
        },
      },
    ]);
    render(<CustomerDataSecuritySection />);

    expect(screen.getByText('Data Security')).toBeInTheDocument();
    expect(await screen.findAllByText('Storage bucket publicly readable')).not.toHaveLength(0);
    expect(screen.getAllByText('Admin accounts without MFA').length).toBeGreaterThan(0);
    expect(screen.queryByText('OpenSSL buffer overflow')).not.toBeInTheDocument();
    expect(screen.queryByText('Old public share')).not.toBeInTheDocument();
    expect(screen.getByText('Public S3 bucket policy applied')).toBeInTheDocument();
    expect(screen.getByText('Cloud infra')).toBeInTheDocument();
    await waitFor(() => expect(kpiValue('Data stores in inventory')).toBe('1'));
    expect(kpiValue('Open exposure findings')).toBe('1');
    expect(kpiValue('Open weakness findings')).toBe('1');
    expect(kpiValue('Open alerts')).toBe('1');

    fireEvent.click(screen.getByRole('tab', { name: 'Data inventory' }));
    expect(screen.getByText('customer-exports')).toBeInTheDocument();
    expect(screen.queryByText('laptop')).not.toBeInTheDocument();
  });

  it('shows honest empty states and the backend error', async () => {
    mockBackend([
      { path: '/api/v1/findings', status: 500, body: { message: 'findings store offline' } },
      { path: '/api/v1/alerts', body: { data: [] } },
      { path: '/api/v1/detections/definitions', body: [] },
      { path: '/api/v1/context/assets', body: { data: [] } },
    ]);
    render(<CustomerDataSecuritySection />);
    expect((await screen.findAllByText('Could not load: findings store offline')).length).toBeGreaterThan(0);
    expect(screen.getByText('No open alerts.')).toBeInTheDocument();
    expect(kpiValue('Open exposure findings')).toBe('—');
  });
});

/* ------------------------------------------------------------ cloud security */

describe('Cloud Security', () => {
  it('shows cloud posture findings and cloud connectors from the backend', async () => {
    mockBackend([
      { path: '/api/v1/findings', body: { data: FINDINGS } },
      { path: '/api/v1/connectors', body: { data: CONNECTORS } },
      { path: '/api/v1/connector-types', body: { data: CONNECTOR_TYPES } },
      {
        path: '/api/v1/reporting/service-health',
        body: { generatedAt: '', connectorHealth: { healthy: 0, total: 1 }, overallHealth: 'DEGRADED' },
      },
    ]);
    render(<CustomerCloudSecuritySection />);

    expect(screen.getByText('Cloud Security')).toBeInTheDocument();
    expect(await screen.findByText('Security group allows SSH')).toBeInTheDocument();
    expect(screen.getByText('Storage bucket publicly readable')).toBeInTheDocument();
    expect(screen.queryByText('Scanner misconfiguration')).not.toBeInTheDocument();
    expect(await screen.findByText('Prod CloudTrail')).toBeInTheDocument();
    expect(kpiValue('Cloud connectors')).toBe('1');
    expect(kpiValue('Open posture findings')).toBe('2');
    await waitFor(() => expect(kpiValue('Connector health (all sources)')).toBe('0 / 1'));
  });

  it('shows empty states when nothing is connected', async () => {
    mockBackend([
      { path: '/api/v1/findings', body: { data: [] } },
      { path: '/api/v1/connectors', body: { data: [] } },
      { path: '/api/v1/connector-types', body: { data: CONNECTOR_TYPES } },
      { path: '/api/v1/reporting/service-health', body: { connectorHealth: { healthy: 0, total: 0 }, overallHealth: 'UNKNOWN' } },
    ]);
    render(<CustomerCloudSecuritySection />);
    expect(await screen.findByText('No open cloud posture findings.')).toBeInTheDocument();
    expect(await screen.findByText('No cloud connectors configured. Add one from the Integrations catalog.')).toBeInTheDocument();
    expect(screen.getByText('No cloud posture findings reported.')).toBeInTheDocument();
  });
});

/* ---------------------------------------------------------- compliance & risk */

const ASSURANCE = {
  generatedAt: '2026-11-05T10:00:00.000Z',
  metrics: {
    controlsEffective: 3,
    controlsPartiallyEffective: 1,
    controlsIneffective: 0,
    controlsUnknown: 0,
    evidenceGapsOpen: 2,
    activeRisks: 1,
    activeExceptions: 4,
    expiredRiskAcceptances: 0,
    expiredExceptions: 1,
  },
  healthState: 'DEGRADED',
};

describe('Compliance & Risk', () => {
  it('shows framework readiness, assurance counts, controls and exceptions from the backend', async () => {
    mockBackend([
      {
        path: '/api/v1/compliance/sector-summary',
        body: {
          data: {
            frameworks: {
              DORA: { score: 62, status: 'REVIEW_REQUIRED', totalArticles: 7, compliantCount: 4, gapCount: 3, merkleRoot: 'abcdef0123456789' },
            },
            assessedAt: '2026-11-05T10:00:00.000Z',
          },
        },
      },
      { path: '/api/v1/reporting/assurance', body: ASSURANCE },
      { path: '/api/v1/controls', body: [{ id: 'co1' }, { id: 'co2' }] },
      {
        path: '/api/v1/control-implementations',
        body: [{ id: 'ci1', title: 'MFA for administrators', implementation_type: 'TECHNICAL', status: 'IMPLEMENTED', effective_from: '2026-10-01T00:00:00Z', reviewed_at: null }],
      },
      {
        path: '/api/v1/exceptions',
        body: [{ id: 'e1', reason: 'Legacy VPN pending retirement', status: 'APPROVED', starts_at: '2026-10-01T00:00:00Z', expires_at: '2026-12-01T00:00:00Z' }],
      },
    ]);
    render(<CustomerComplianceRiskSection />);

    expect(screen.getByText('Compliance & Risk')).toBeInTheDocument();
    expect(await screen.findByText('DORA')).toBeInTheDocument();
    expect(screen.getByText('4 / 7')).toBeInTheDocument();
    expect(screen.getByText('62%')).toBeInTheDocument();
    await waitFor(() => expect(kpiValue('Control effectiveness')).toBe('75%'));
    expect(kpiValue('Open evidence gaps')).toBe('2');
    expect(kpiValue('Active exceptions')).toBe('4');
    await waitFor(() => expect(kpiValue('Active policy pack')).toBe('EU (Ireland)'));
    expect(screen.getByText('eu_gdpr_dora_nis2_ie')).toBeInTheDocument();
    expect(await screen.findByText('MFA for administrators')).toBeInTheDocument();
    expect(screen.getByText('2 control objectives in the catalogue')).toBeInTheDocument();
    expect(screen.getByText('Legacy VPN pending retirement')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Exceptions' }));
    expect(screen.queryByText('MFA for administrators')).not.toBeInTheDocument();
    expect(screen.getByText('Legacy VPN pending retirement')).toBeInTheDocument();
  });

  it('shows empty states and no invented percentages when nothing is assessed', async () => {
    mockBackend([
      { path: '/api/v1/compliance/sector-summary', body: { data: { frameworks: {}, assessedAt: '' } } },
      { path: '/api/v1/reporting/assurance', body: { ...ASSURANCE, metrics: { ...ASSURANCE.metrics, controlsEffective: 0, controlsPartiallyEffective: 0 } } },
      { path: '/api/v1/controls', body: [] },
      { path: '/api/v1/control-implementations', body: [] },
      { path: '/api/v1/exceptions', body: [] },
    ]);
    render(<CustomerComplianceRiskSection />);
    expect(await screen.findByText('No frameworks are being evaluated for this workspace.')).toBeInTheDocument();
    expect(await screen.findByText('No control implementations recorded for this workspace.')).toBeInTheDocument();
    expect(screen.getByText('No exceptions have been requested.')).toBeInTheDocument();
    await waitFor(() => expect(kpiValue('Control effectiveness')).toBe('—'));
    expect(screen.getByText('No control assessments recorded yet')).toBeInTheDocument();
  });
});

/* -------------------------------------------------------- reports & analytics */

describe('Reports & Analytics', () => {
  it('lists packages, snapshots and exports and downloads the real export file', async () => {
    const spy = mockBackend([
      { path: '/api/v1/reporting/snapshots', body: [] },
      { path: '/api/v1/reporting/definitions', body: [] },
      {
        path: '/api/v1/exports',
        body: [{ id: 'x1', purpose: 'Quarterly audit evidence', export_type: 'T', status: 'READY', progress: 100, created_at: '2026-11-04T10:00:00Z', completed_at: '2026-11-04T10:01:00Z' }],
      },
      {
        path: '/api/v1/audit-packages',
        body: [{ id: 'p1', purpose: 'SOC 2 FY26', period_start: '2026-01-01T00:00:00Z', period_end: '2026-06-30T00:00:00Z', status: 'DRAFT', completeness_state: 'UNKNOWN', created_at: '' }],
      },
      { path: '/api/v1/exports/x1/download/file', body: { jobId: 'x1', manifest: null, artifacts: [] } },
    ]);
    render(<CustomerReportsAnalyticsSection />);

    expect(screen.getByText('Reports & Analytics')).toBeInTheDocument();
    expect(await screen.findByText('Quarterly audit evidence')).toBeInTheDocument();
    expect(await screen.findByText('SOC 2 FY26')).toBeInTheDocument();
    expect(screen.getByText('No report snapshots generated yet.')).toBeInTheDocument();
    expect(screen.getByText('No report definitions are published yet, so snapshots cannot be generated.')).toBeInTheDocument();

    const exportRow = screen.getByText('Quarterly audit evidence').closest('tr')!;
    fireEvent.click(within(exportRow).getByRole('button', { name: /Download/ }));
    expect(await screen.findByText('Downloaded zoikoshield-export-x1.json.')).toBeInTheDocument();
    expect(callsTo(spy, 'GET', '/api/v1/exports/x1/download/file')).toHaveLength(1);
  });

  it('requests an export with the chosen scope and shows empty states', async () => {
    const spy = mockBackend([
      { path: '/api/v1/reporting/snapshots', body: [] },
      { path: '/api/v1/reporting/definitions', body: [] },
      { path: '/api/v1/exports', body: [] },
      { path: '/api/v1/audit-packages', body: [] },
      { method: 'POST', path: '/api/v1/exports', body: { id: 'x2', status: 'REQUESTED' } },
    ]);
    render(<CustomerReportsAnalyticsSection />);
    expect(await screen.findByText('No exports requested yet.')).toBeInTheDocument();
    expect(screen.getByText('No audit packages yet.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Request export' }));
    fireEvent.change(screen.getByPlaceholderText('Why this export is needed'), { target: { value: 'Board pack' } });
    fireEvent.click(screen.getByLabelText('Alerts'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit export request' }));

    expect(await screen.findByText('Export requested (status: Requested).')).toBeInTheDocument();
    const [, init] = callsTo(spy, 'POST', '/api/v1/exports')[0];
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      purpose: 'Board pack',
      exportType: 'CUSTOMER_DATA_EXPORT',
      requestedScope: ['alerts'],
      formats: ['JSON'],
      environmentId: ENV_ID,
    });
  });
});

/* -------------------------------------------------------------- integrations */

describe('Integrations', () => {
  it('lists real connectors and the supported catalogue', async () => {
    mockBackend([
      { path: '/api/v1/connectors', body: { data: CONNECTORS } },
      { path: '/api/v1/connector-types', body: { data: CONNECTOR_TYPES } },
      {
        path: '/api/v1/connectors/c1/health',
        body: { data: { state: 'DEGRADED', lastMessage: 'Token rejected', permissionStatus: 'UNKNOWN', credentialStatus: 'INVALID', consecutiveFailures: 3, lastSuccessfulConnectionAt: null, lastSuccessfulSyncAt: null } },
      },
    ]);
    render(<CustomerIntegrationsSection />);

    expect(screen.getByText('Integrations')).toBeInTheDocument();
    expect((await screen.findAllByText('Prod CloudTrail')).length).toBeGreaterThan(0);
    expect(screen.getByText('1 integration')).toBeInTheDocument();
    expect(kpiValue('Needs attention')).toBe('1');
    expect(await screen.findByText('Token rejected')).toBeInTheDocument();
    expect(screen.getByText('Invalid')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Catalog' }));
    expect(screen.getByText('Okta')).toBeInTheDocument();
    expect(screen.getByText('Collect Okta identity events')).toBeInTheDocument();
  });

  it('shows the empty state when no connectors exist', async () => {
    mockBackend([
      { path: '/api/v1/connectors', body: { data: [] } },
      { path: '/api/v1/connector-types', body: { data: CONNECTOR_TYPES } },
    ]);
    render(<CustomerIntegrationsSection />);
    expect(await screen.findByText('No integrations connected yet. Add one from the catalog.')).toBeInTheDocument();
    expect(screen.getByText('No connector issues reported.')).toBeInTheDocument();
    expect(kpiValue('Configured integrations')).toBe('0');
  });

  async function fillAddForm() {
    fireEvent.click(screen.getByRole('button', { name: '+ Add integration' }));
    await screen.findByRole('option', { name: 'Okta' });
    fireEvent.change(screen.getByPlaceholderText('Integration name'), { target: { value: 'Corp Okta' } });
    fireEvent.change(screen.getByLabelText(/^Connector type/), { target: { value: 'okta-identity' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  }

  it('creates a connector with the tenant environment and residency region', async () => {
    const spy = mockBackend([
      { path: '/api/v1/connectors', body: { data: [] } },
      { path: '/api/v1/connector-types', body: { data: CONNECTOR_TYPES } },
      {
        method: 'POST',
        path: '/api/v1/connectors',
        status: 201,
        body: { statusCode: 201, data: { id: 'c9', name: 'Corp Okta', state: 'NOT_CONNECTED', definition: { provider: 'okta-identity' } } },
      },
    ]);
    render(<CustomerIntegrationsSection />);
    await screen.findByText('No integrations connected yet. Add one from the catalog.');
    await fillAddForm();

    expect(await screen.findByText('Connector "Corp Okta" created (state: Not connected).')).toBeInTheDocument();
    const [, init] = callsTo(spy, 'POST', '/api/v1/connectors')[0];
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      name: 'Corp Okta',
      provider: 'okta-identity',
      environmentId: ENV_ID,
      sourceRegion: 'eu-west-1',
      authenticationType: 'API_KEY',
    });
    // The list is fetched again after the write.
    await waitFor(() => expect(callsTo(spy, 'GET', '/api/v1/connectors').length).toBeGreaterThanOrEqual(2));
  });

  it('shows the backend error and no success when creation fails', async () => {
    mockBackend([
      { path: '/api/v1/connectors', body: { data: [] } },
      { path: '/api/v1/connector-types', body: { data: CONNECTOR_TYPES } },
      { method: 'POST', path: '/api/v1/connectors', status: 503, body: { message: 'INGEST_UNAVAILABLE' } },
    ]);
    render(<CustomerIntegrationsSection />);
    await screen.findByText('No integrations connected yet. Add one from the catalog.');
    await fillAddForm();

    expect(await screen.findByRole('alert')).toHaveTextContent('INGEST_UNAVAILABLE');
    expect(screen.queryByText(/created \(state/)).not.toBeInTheDocument();
    expect(screen.getByText('No integrations connected yet. Add one from the catalog.')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ settings */

const SETTINGS_ROUTES: Route[] = [
  {
    path: `/api/v1/tenants/${TENANT_ID}/members`,
    body: [{ id: 'm1', principalId: 'p-1', status: 'ACTIVE', source: 'BOOTSTRAP', joinedAt: '2026-11-01T10:00:00Z', roles: [{ code: 'TENANT_OWNER', name: 'Tenant Owner' }] }],
  },
  { path: `/api/v1/tenants/${TENANT_ID}/invitations`, body: [] },
  {
    path: '/api/v1/roles',
    body: [
      { id: 'r-owner', code: 'TENANT_OWNER', name: 'Tenant Owner', roleLevel: 'TENANT' },
      { id: 'r-platform', code: 'PLATFORM_X', name: 'Platform Only', roleLevel: 'PLATFORM' },
    ],
  },
  { path: `/api/v1/tenants/${TENANT_ID}/identity-providers`, body: [] },
  { path: '/api/v1/auth/passkeys', body: [] },
  { path: `/api/v1/tenants/${TENANT_ID}/offboarding/retention-policy`, body: [] },
  { path: '/api/v1/notification-policies', body: [] },
  { path: '/api/v1/notification-preferences', body: [] },
];

describe('Settings', () => {
  it('shows the tenant profile, members and sign-in controls from the backend', async () => {
    mockBackend(SETTINGS_ROUTES);
    render(<CustomerSettingsSection />);

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(await screen.findByText('Northwind Test Org')).toBeInTheDocument();
    expect(screen.getByText('northwind-test')).toBeInTheDocument();
    expect(screen.getByText('Asia/Kolkata')).toBeInTheDocument();
    expect(await screen.findByText('You')).toBeInTheDocument();
    expect(screen.getAllByText('Tenant Owner').length).toBeGreaterThan(0);
    expect(screen.getByText('No identity provider configured; members sign in with ZoikoShield credentials.')).toBeInTheDocument();
    expect(screen.getByText('No notification policies are published yet.')).toBeInTheDocument();
    expect(kpiValue('Members')).toBe('1');
    expect(screen.queryByRole('option', { name: 'Platform Only' })).not.toBeInTheDocument();
    // None of the old invented values survive.
    expect(screen.queryByText('Europe/Dublin')).not.toBeInTheDocument();
    expect(screen.queryByText('8 hours')).not.toBeInTheDocument();
    expect(screen.queryByText('Microsoft Entra ID')).not.toBeInTheDocument();
  });

  async function invite() {
    await screen.findByRole('option', { name: 'Tenant Owner' });
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'new.member@example.test' } });
    fireEvent.change(screen.getByLabelText(/^Role/), { target: { value: 'r-owner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite member' }));
  }

  it('sends the invitation to the tenant and refreshes the list', async () => {
    const spy = mockBackend([
      ...SETTINGS_ROUTES,
      {
        method: 'POST',
        path: `/api/v1/tenants/${TENANT_ID}/invitations`,
        status: 201,
        body: { invitationId: 'i1', expiresAt: '2026-11-12T10:00:00Z', token: 'tok-123' },
      },
    ]);
    render(<CustomerSettingsSection />);
    await invite();

    expect(await screen.findByText(/Invitation created for new.member@example.test/)).toHaveTextContent('tok-123');
    const [, init] = callsTo(spy, 'POST', `/api/v1/tenants/${TENANT_ID}/invitations`)[0];
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ invitedEmail: 'new.member@example.test', roleId: 'r-owner' });
    await waitFor(() => expect(callsTo(spy, 'GET', `/api/v1/tenants/${TENANT_ID}/invitations`).length).toBeGreaterThanOrEqual(2));
  });

  it('shows the backend error when the invitation is refused', async () => {
    mockBackend([
      ...SETTINGS_ROUTES,
      {
        method: 'POST',
        path: `/api/v1/tenants/${TENANT_ID}/invitations`,
        status: 403,
        body: { message: 'Missing tenant:member:invite permission for this tenant' },
      },
    ]);
    render(<CustomerSettingsSection />);
    await invite();

    expect(await screen.findByRole('alert')).toHaveTextContent('Missing tenant:member:invite permission for this tenant');
    expect(screen.queryByText(/Invitation created/)).not.toBeInTheDocument();
  });

  it('shows an error instead of a profile when the tenant cannot be loaded', async () => {
    mockBackend([...SETTINGS_ROUTES, { path: `/api/v1/tenants/${TENANT_ID}`, status: 500, body: { message: 'tenant lookup failed' } }]);
    render(<CustomerSettingsSection />);
    expect(await screen.findByText('Workspace details could not be loaded: tenant lookup failed')).toBeInTheDocument();
    expect(screen.queryByText('Northwind Test Org')).not.toBeInTheDocument();
  });
});
