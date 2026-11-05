import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import CustomerDashboardPage from '@/app/customer/dashboard/page';
import TenantAdminDashboardPage from '@/app/admin/tenant/page';
import {
  resolveCountryFromRegion,
  resolveRegionMetadata,
  resolvePolicyPackForRegion,
  resolveRetentionScheduleFromPolicyPack,
  G01_CLAIM_REGISTRY,
  G07_LAUNCH_CANDIDATE_RULES,
  G08_RETENTION_SCHEDULE,
} from '@/lib/assurance-primitives';
import {
  DataProvenanceBadge,
  UnavailableState,
} from '@/components/states/mandatory-ui-states';
import {
  CUSTOMER_PRIMARY_NAV,
  CUSTOMER_FOOTER_NAV,
} from '@/components/customer/CustomerSidebar';
import { CustomerWorkspaceSectionRouter } from '@/components/customer/CustomerWorkspaceViews';

vi.mock('next/navigation', () => ({
  usePathname: () => '/customer/dashboard',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

type Routes = Record<string, unknown | ((init?: RequestInit) => Response)>;

/** Routes a mocked fetch by URL path prefix (longest match wins). */
function mockBackend(routes: Routes) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const key = Object.keys(routes)
      .filter((k) => (url.pathname + url.search).startsWith(k) || url.pathname.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    if (!key) return new Response(JSON.stringify({ message: `unmocked ${url.pathname}` }), { status: 404 });
    const r = routes[key];
    if (typeof r === 'function') return (r as (init?: RequestInit) => Response)(init);
    return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });
  });
}

const NOW = new Date().toISOString();
const ME = { id: 'u1', email: 'owner@acme.test', fullName: 'Owner', tenantId: 't1', environmentId: 'e1', region: 'eu-west-1' };
const TENANT = { id: 't1', name: 'Acme Test Org', slug: 'acme-test', status: 'ACTIVE', homeRegion: 'eu-west-1', dataResidencyRegion: 'eu-west-1', timezone: 'UTC', dataClass: 'STANDARD', retentionPolicyRef: 'default', createdAt: NOW, updatedAt: NOW };
const ALERT = (over: Record<string, unknown> = {}) => ({ id: 'a1', title: 'Impossible travel sign-in', description: null, severity: 'CRITICAL', priority: 'P1', confidence: 0.9, status: 'NEW', detection_definition_id: 'd1', coverage_state: 'COMPLETE', incomplete_data: false, primary_asset_id: null, primary_identity_id: null, assigned_to: null, created_at: NOW, updated_at: NOW, acknowledged_at: null, resolved_at: null, ...over });
const FINDING = (over: Record<string, unknown> = {}) => ({ id: 'f1', asset_id: null, asset_external_ref: null, source_system: 'aws', finding_type: 'EXPOSURE', title: 'Public bucket', description: null, vulnerability_ref: null, severity: 'CRITICAL', status: 'OPEN', priority_score: 9, first_detected_at: NOW, last_confirmed_at: NOW, resolved_at: null, acceptance: null, assertion: { state: 'CURRENT', reason: '' }, ...over });

function fullRoutes(over: Routes = {}): Routes {
  return {
    '/api/v1/auth/me': ME,
    '/api/v1/tenants/t1': TENANT,
    '/api/v1/alerts': { statusCode: 200, data: [ALERT(), ALERT({ id: 'a2', title: 'Old closed alert', severity: 'HIGH', status: 'CLOSED' })] },
    '/api/v1/cases': { statusCode: 200, data: [{ id: 'c1', title: 'Credential compromise', description: null, severity: 'HIGH', priority: 'P2', status: 'NEW', owner_id: null, queue_id: null, created_at: NOW, resolved_at: null, closed_at: null }] },
    '/api/v1/findings/summary': { statusCode: 200, data: { metrics: { total: 3, open: 2, staleAssertions: 1, ageingAssertions: 0, unscored: 0, scoredOverUnknowns: 0, unresolvedAsset: 2, accepted: 0, resolved: 1 }, openBySeverity: { CRITICAL: 1, HIGH: 1 }, openByType: { EXPOSURE: 1, VULNERABILITY: 1 } } },
    '/api/v1/findings': { statusCode: 200, data: [FINDING()] },
    '/api/v1/reporting/security': { generatedAt: NOW, metrics: { openAlerts: 5, criticalAlerts: 2, openCases: 1, casesAwaitingCustomer: 0 } },
    '/api/v1/reporting/assurance': { generatedAt: NOW, metrics: { controlsEffective: 3, controlsPartiallyEffective: 1, controlsIneffective: 0, controlsUnknown: 0, evidenceGapsOpen: 2, activeRisks: 0, activeExceptions: 1, expiredRiskAcceptances: 0, expiredExceptions: 0 }, healthState: 'HEALTHY' },
    '/api/v1/reporting/service-health': { generatedAt: NOW, connectorHealth: { healthy: 1, total: 2 }, overallHealth: 'DEGRADED', aiAvailability: 'AVAILABLE', actionSimulationHealth: 'UNKNOWN', evidenceLedgerHealth: 'HEALTHY', anchorHealth: 'UNKNOWN' },
    '/api/v1/compliance/sector-summary': { statusCode: 200, data: { tenantId: 't1', environmentId: 'e1', frameworks: { DORA: { score: null, status: 'REVIEW_REQUIRED', totalArticles: 7, compliantCount: 2, gapCount: 1 } }, assessedAt: NOW } },
    '/api/v1/context/assets': { statusCode: 200, data: [{ id: 's1', external_id: 'i-1', asset_type: 'SERVER', name: 'web-1', criticality: 'HIGH', status: 'ACTIVE', first_seen_at: NOW, last_seen_at: NOW }] },
    '/api/v1/detections/definitions': { statusCode: 200, data: [{ id: 'd1', key: 'IMPOSSIBLE_TRAVEL', name: 'Impossible travel', description: null, owner: null, category: 'IDENTITY', status: 'ACTIVE', versions: [{ id: 'v1' }] }] },
    '/api/v1/commercial/portal/summary': { statusCode: 200, data: { tenantId: 't1', entitlementsSummary: { total: 0, activeCount: 0, entitlements: [] }, protectedResourcesSummary: [], serviceObligationsSummary: { total: 0, pending: 0, delivered: 0 }, invoicesSummary: { totalInvoices: 0 } } },
    ...over,
  };
}

describe('Customer Dashboard (Executive Security Overview) & Separated Dashboards', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders KPIs, priority actions and panels from backend data only', async () => {
    mockBackend(fullRoutes());
    render(<CustomerDashboardPage />);

    expect(await screen.findByText('Acme Test Org · Your security posture, risks, and key insights at a glance.')).toBeInTheDocument();
    expect(screen.getByText('Open Findings')).toBeInTheDocument();
    expect(screen.getByText('Critical Exposures')).toBeInTheDocument();
    expect(screen.getByText('Active Incidents')).toBeInTheDocument();
    expect(screen.getByText('Open Alerts')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument(); // reporting/security openAlerts
    expect(screen.getByText('2 critical')).toBeInTheDocument();

    // Priority actions are derived from real records, most severe first.
    expect(screen.getByText('Triage alert: Impossible travel sign-in')).toBeInTheDocument();
    expect(screen.getByText('Review case: Credential compromise')).toBeInTheDocument();
    expect(screen.getByText('Remediate: Public bucket')).toBeInTheDocument();

    // Nothing from the old fabricated dashboard.
    for (const fake of ['78', '247', '1,842', '17 / 20 controls', 'Approve pending response action (Case #4287)']) {
      expect(screen.queryByText(fake)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/vs\. last 30 days/)).not.toBeInTheDocument();
  });

  it('shows empty states, not invented numbers, for a brand-new tenant', async () => {
    mockBackend(
      fullRoutes({
        '/api/v1/alerts': { statusCode: 200, data: [] },
        '/api/v1/cases': { statusCode: 200, data: [] },
        '/api/v1/findings/summary': { statusCode: 200, data: { metrics: { total: 0, open: 0, staleAssertions: 0, ageingAssertions: 0, unscored: 0, scoredOverUnknowns: 0, unresolvedAsset: 0, accepted: 0, resolved: 0 }, openBySeverity: {}, openByType: {} } },
        '/api/v1/findings': { statusCode: 200, data: [] },
        '/api/v1/context/assets': { statusCode: 200, data: [] },
        '/api/v1/reporting/assurance': { generatedAt: NOW, metrics: { controlsEffective: 0, controlsPartiallyEffective: 0, controlsIneffective: 0, controlsUnknown: 0, evidenceGapsOpen: 0, activeRisks: 0, activeExceptions: 0, expiredRiskAcceptances: 0, expiredExceptions: 0 }, healthState: 'UNKNOWN' },
      }),
    );
    render(<CustomerDashboardPage />);

    expect(await screen.findByText('Nothing needs attention right now.')).toBeInTheDocument();
    expect(screen.getByText(/No open findings/)).toBeInTheDocument();
    expect(screen.getByText('No critical or high alerts.')).toBeInTheDocument();
    expect(screen.getByText('No controls assessed yet.')).toBeInTheDocument();
    expect(screen.getByText(/No assets known yet/)).toBeInTheDocument();
  });

  it('shows a per-panel error when one source fails, and keeps the rest', async () => {
    mockBackend(
      fullRoutes({
        '/api/v1/alerts': () => new Response(JSON.stringify({ message: 'alert store offline' }), { status: 503 }),
      }),
    );
    render(<CustomerDashboardPage />);

    expect((await screen.findAllByText(/Could not load alerts: alert store offline/)).length).toBeGreaterThan(0);
    expect(screen.getByText('Remediate: Public bucket')).toBeInTheDocument();
  });

  it('changes an alert status through the backend and shows the backend error on failure', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const routes = fullRoutes();
    const spy = mockBackend(routes);
    spy.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/v1/alerts/a1/status')) {
        calls.push({ url, body: JSON.parse(String(init?.body)) });
        return new Response(JSON.stringify({ message: "Invalid alert transition 'NEW' -> 'ACKNOWLEDGED'" }), { status: 400 });
      }
      const path = new URL(url, 'http://localhost');
      const key = Object.keys(routes).filter((k) => path.pathname.startsWith(k)).sort((a, b) => b.length - a.length)[0];
      return new Response(JSON.stringify(routes[key]), { status: 200 });
    });
    render(<CustomerDashboardPage />);

    const select = await screen.findByLabelText('Status for Impossible travel sign-in');
    fireEvent.change(select, { target: { value: 'ACKNOWLEDGED' } });

    await waitFor(() => expect(calls).toEqual([{ url: expect.stringContaining('/api/v1/alerts/a1/status'), body: { status: 'ACKNOWLEDGED' } }]));
    expect(await screen.findByText(/Invalid alert transition/)).toBeInTheDocument();
  });

  it('switches to SOC View (real detection rules) and Account View (tenant + policy-pack retention)', async () => {
    mockBackend(fullRoutes());
    render(<CustomerDashboardPage />);
    await screen.findByText('Open Findings');

    fireEvent.click(screen.getByText('SOC View'));
    expect(screen.getByText(/Active Scoped Detection Rules & Entity Risk Posture/i)).toBeInTheDocument();
    expect(screen.getByText('Impossible travel')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument(); // connectors healthy / total

    fireEvent.click(screen.getByText('Account View'));
    expect(screen.getByText(/Contracted Data Class Retention & Legal Hold Schedule/i)).toBeInTheDocument();
    expect(screen.getByText('acme-test')).toBeInTheDocument();
    expect(screen.getByText(/These are the configured retention limits, not measured storage/)).toBeInTheDocument();
    expect(screen.getByText('No entitlements recorded for this workspace yet.')).toBeInTheDocument();
  });

  it('renders the separated Tenant Administrator Dashboard (/admin/tenant) from backend data', async () => {
    mockBackend(
      fullRoutes({
        '/api/v1/tenants/t1/members': [{ id: 'm1', principalId: 'p1aaaaaaaa', status: 'ACTIVE', joinedAt: NOW, roles: [{ code: 'TENANT_OWNER', name: 'Tenant Owner' }] }],
        '/api/v1/tenants/t1/invitations': [],
        '/api/v1/tenants/t1/identity-providers': [],
        '/api/v1/tenants/t1/jit-audit': [],
        '/api/v1/tenants/t1/offboarding/legal-holds': [],
        '/api/v1/response/freeze-status': { statusCode: 200, frozen: false, status: 'OPERATIONAL', freeze: null },
      }),
    );
    render(<TenantAdminDashboardPage />);

    expect(screen.getByText('Tenant Administration & Governance Control Plane')).toBeInTheDocument();
    expect(await screen.findByText('1 active members')).toBeInTheDocument();
    expect(screen.getByText('1 / 2 healthy')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('0 active legal holds')).toBeInTheDocument();
    expect(screen.getByText(/Tenant Residency Configuration/)).toBeInTheDocument();
    expect(screen.queryByText('7 / 7 Boundaries Enforced')).not.toBeInTheDocument();
    expect(screen.queryByText(/Epoch #42/)).not.toBeInTheDocument();
  });
});

describe('G01–G12 Engineering Gap Closure Primitives', () => {
  it('maps canonical cloud regions to accurate ISO-3166-1 alpha-2 country codes (G02 / C09)', () => {
    expect(resolveCountryFromRegion('eu-west-1')).toBe('IE');
    expect(resolveCountryFromRegion('ap-south-1')).toBe('IN');
    expect(resolveCountryFromRegion('eu-central-1')).toBe('DE');
    expect(resolveCountryFromRegion('eu-west-2')).toBe('GB');
    expect(resolveCountryFromRegion('us-east-1')).toBe('US');

    const irelandMeta = resolveRegionMetadata('eu-west-1');
    expect(irelandMeta.shortLabel).toBe('EU (Ireland)');
    expect(irelandMeta.countryName).toBe('Ireland (EU GDPR)');
  });

  it('provides the G01 Claim Registry, G07 Rules, and G08 7-Class Retention Schedule', () => {
    expect(G01_CLAIM_REGISTRY.length).toBeGreaterThanOrEqual(8);
    expect(G07_LAUNCH_CANDIDATE_RULES.length).toBeGreaterThanOrEqual(6);
    expect(G08_RETENTION_SCHEDULE.length).toBe(7);
  });

  it('renders DataProvenanceBadge and G05/G11 UnavailableState with canonical RPO <= 15m and RTO <= 60m defaults', () => {
    render(
      <div>
        <DataProvenanceBadge
          provenance="VERIFIED_BACKEND"
          asOf="Oct 31, 2026 14:32 UTC"
          sourceService="shield-core"
        />
        <UnavailableState />
      </div>
    );

    expect(screen.getByText('Live Data')).toBeInTheDocument();
    expect(screen.getByText('RTO Target: <= 60m')).toBeInTheDocument();
    expect(screen.getByText('RPO Target: <= 15m')).toBeInTheDocument();
  });

  it('resolves retention limits directly from the winning canonical policy_pack per region', () => {
    const iePack = resolvePolicyPackForRegion('eu-west-1');
    const inPack = resolvePolicyPackForRegion('ap-south-1');
    expect(iePack.policy_key).toBe('eu_gdpr_dora_nis2_ie');
    expect(inPack.policy_key).toBe('in_dpdp_certin_rbi_aps1');

    const inSchedule = resolveRetentionScheduleFromPolicyPack('ap-south-1');
    const rawEventClass = inSchedule.find(
      (c) => c.dataClass === 'RAW_SECURITY_EVENT'
    );
    expect(rawEventClass?.hotDays).toBe(60);
    expect(rawEventClass?.coldArchiveDays).toBe(180);
    expect(rawEventClass?.policyPackKey).toBe('in_dpdp_certin_rbi_aps1');
  });

  it('connects all 14 Customer Sidebar navigation items to /customer/* routes and renders the Customer Workspace views without mock/sample banners', () => {
    const allNav = [...CUSTOMER_PRIMARY_NAV, ...CUSTOMER_FOOTER_NAV];
    expect(allNav.length).toBe(14);
    for (const item of allNav) {
      expect(item.href.startsWith('/customer/')).toBe(true);
    }

    const sectionsToVerify: Array<{ slug: string; heading: string }> = [
      { slug: 'security-overview', heading: 'Security Overview' },
      { slug: 'threats-incidents', heading: 'Threats & Incidents' },
      { slug: 'exposure-management', heading: 'Exposure Management' },
      { slug: 'assets-inventory', heading: 'Assets & Inventory' },
      { slug: 'vulnerabilities', heading: 'Vulnerabilities' },
      { slug: 'detection-response', heading: 'Detection & Response' },
      { slug: 'identity-access', heading: 'Identity & Access' },
      { slug: 'data-security', heading: 'Data Security' },
      { slug: 'cloud-security', heading: 'Cloud Security' },
      { slug: 'compliance-risk', heading: 'Compliance & Risk' },
      { slug: 'reports-analytics', heading: 'Reports & Analytics' },
      { slug: 'integrations', heading: 'Integrations' },
      { slug: 'settings', heading: 'Settings' },
    ];

    for (const sec of sectionsToVerify) {
      const { unmount } = render(
        <CustomerWorkspaceSectionRouter section={sec.slug} />
      );
      expect(screen.getByText(sec.heading)).toBeInTheDocument();
      expect(screen.queryByText(/Sample data/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Demo workspace/i)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Illustrative customer workspace/i)
      ).not.toBeInTheDocument();
      unmount();
    }
  });
});
