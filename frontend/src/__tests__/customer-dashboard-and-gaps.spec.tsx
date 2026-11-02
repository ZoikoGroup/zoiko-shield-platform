import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
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

vi.mock('next/navigation', () => ({
  usePathname: () => '/customer/dashboard',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe('Customer Dashboard (Executive Security Overview) & Separated Dashboards', () => {
  it('renders the Customer Dashboard matching Lennox Sir Executive Security Overview wireframe', () => {
    render(<CustomerDashboardPage />);

    // Title & Subtitle
    expect(screen.getByText('Executive Security Overview')).toBeInTheDocument();
    expect(
      screen.getByText('Your security posture, risks, and key insights at a glance.')
    ).toBeInTheDocument();

    // 3 View Mode Tabs
    expect(screen.getByText('Executive View')).toBeInTheDocument();
    expect(screen.getByText('SOC View')).toBeInTheDocument();
    expect(screen.getByText('Account View')).toBeInTheDocument();

    // 4 Top KPI Cards
    expect(screen.getByText('Security Posture')).toBeInTheDocument();
    expect(screen.getByText('78')).toBeInTheDocument();
    expect(screen.getByText('Critical Exposures')).toBeInTheDocument();
    expect(screen.getByText('Protection Coverage')).toBeInTheDocument();
    expect(screen.getByText('Active Incidents')).toBeInTheDocument();

    // Priority Actions (4)
    expect(screen.getByText('Priority Actions')).toBeInTheDocument();
    expect(
      screen.getByText('Review critical incident: Possible credential compromise')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Enable detection coverage for 3 unmonitored systems')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Approve pending response action (Case #4287)')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Review AI recommendation for policy update')
    ).toBeInTheDocument();

    // Threat Activity Overview (247 / 18 / 5)
    expect(screen.getByText('Threat Activity Overview')).toBeInTheDocument();
    expect(screen.getByText('247')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();

    // Top Threat Categories
    expect(screen.getByText('Top Threat Categories')).toBeInTheDocument();
    expect(screen.getByText('Credential Access')).toBeInTheDocument();

    // Detection Coverage & Assurance & Compliance
    expect(screen.getByText('Detection Coverage')).toBeInTheDocument();
    expect(screen.getByText('1,842')).toBeInTheDocument();
    expect(screen.getByText('Recent Critical Alerts')).toBeInTheDocument();
    expect(screen.getByText('Assurance & Compliance')).toBeInTheDocument();
    expect(screen.getByText('17 / 20 controls')).toBeInTheDocument();
  });

  it('switches cleanly between Executive View, SOC View, and Account View on the Customer Dashboard', () => {
    render(<CustomerDashboardPage />);

    fireEvent.click(screen.getByText('SOC View'));
    expect(
      screen.getByText(/Active Scoped Detection Rules & Entity Risk Posture/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('Account View'));
    expect(
      screen.getByText(/Contracted Data Class Retention & Legal Hold Schedule/i)
    ).toBeInTheDocument();
  });

  it('renders the separated Tenant Administrator Dashboard (/admin/tenant)', () => {
    render(<TenantAdminDashboardPage />);

    expect(
      screen.getByText('Tenant Administration & Governance Control Plane')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Tenant Residency & Subsystem Isolation Boundary Evidence/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText('7 / 7 Boundaries Enforced')
    ).toBeInTheDocument();
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

  it('supports interactive KPI drilldown, dynamic time windows, alert filtering, and blocks duplicate Priority Actions', () => {
    render(<CustomerDashboardPage />);

    // Click Security Posture KPI card to open drilldown and remediate coverage gap
    fireEvent.click(screen.getByText('Security Posture'));
    expect(
      screen.getByText(/Live Executive KPI Drilldown/i)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Remediate Coverage \(\+12 Assets\)/i));
    expect(screen.getByText('79')).toBeInTheDocument();
    expect(screen.getByText('1,854')).toBeInTheDocument();

    // Change Threat Activity Overview window from Last 24 hours (247) to Last 7 days (1684)
    const activitySelect = screen.getByLabelText(
      'Threat Activity Time Window'
    );
    fireEvent.change(activitySelect, { target: { value: 'Last 7 days' } });
    expect(screen.getByText('1684')).toBeInTheDocument();

    // Open New Priority Action form and verify duplicate prevention
    fireEvent.click(screen.getByText('New Action'));
    const input = screen.getByPlaceholderText(
      'Enter priority action title...'
    );
    fireEvent.change(input, {
      target: {
        value: 'Review critical incident: Possible credential compromise',
      },
    });
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getByText(/Duplicate prevented/i)).toBeInTheDocument();
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
});
