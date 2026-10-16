import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

global.EventSource = vi.fn(function () {
  return { addEventListener: vi.fn(), removeEventListener: vi.fn(), close: vi.fn() };
}) as any;

import AdminPage from '@/app/admin/page';
import GtmChecklistPage from '@/app/admin/gtm-checklist/page';
import JitElevationPage from '@/app/admin/jit-elevation/page';
import G1GatePage from '@/app/admin/g1-gate/page';
import PlatformHealthPage from '@/app/admin/platform-health/page';
import FleetPage from '@/app/partner/fleet/page';
import OnboardingPage from '@/app/onboarding/page';
import TeamPage from '@/app/team/page';
import NotificationsPage from '@/app/notifications/page';
import RiskPage from '@/app/risk/page';
import AuditPage from '@/app/audit/page';
import LedgerPage from '@/app/ledger/page';
import ConnectorsPage from '@/app/connectors/page';
import AssetsPage from '@/app/assets/page';
import IngestionPage from '@/app/ingestion/page';
import IrRetainerPage from '@/app/ir-retainer/page';
import ActionsPage from '@/app/actions/page';
import RedTeamPage from '@/app/red-team/page';
import ResponseProposalsPage from '@/app/response-proposals/page';
import PlaybooksPage from '@/app/playbooks/page';
import IncidentCommandPage from '@/app/cases/incidents/command/page';
import CopilotPage from '@/app/copilot/page';
import HuntingPage from '@/app/hunting/page';
import TenantManagementPage from '@/app/tenant-management/page';
import HelpPage from '@/app/help/page';

// Every redesigned page keeps its previous, fully wired implementation mounted
// behind the last tab so no live workflow was lost in the redesign.
const WORKSPACES: [string, React.ComponentType][] = [
  ['/admin', AdminPage],
  ['/admin/gtm-checklist', GtmChecklistPage],
  ['/admin/jit-elevation', JitElevationPage],
  ['/admin/g1-gate', G1GatePage],
  ['/admin/platform-health', PlatformHealthPage],
  ['/partner/fleet', FleetPage],
  ['/onboarding', OnboardingPage],
  ['/team', TeamPage],
  ['/notifications', NotificationsPage],
  ['/risk', RiskPage],
  ['/audit', AuditPage],
  ['/ledger', LedgerPage],
  ['/connectors', ConnectorsPage],
  ['/assets', AssetsPage],
  ['/ingestion', IngestionPage],
  ['/ir-retainer', IrRetainerPage],
  ['/actions', ActionsPage],
  ['/red-team', RedTeamPage],
  ['/response-proposals', ResponseProposalsPage],
  ['/playbooks', PlaybooksPage],
  ['/cases/incidents/command', IncidentCommandPage],
  ['/copilot', CopilotPage],
  ['/hunting', HuntingPage],
];

describe('Mockup workspace pages', () => {
  it.each(WORKSPACES)('%s hides the live console until its tab is selected', (_route, Page) => {
    render(<Page />);
    const consoleRegion = screen.getByTestId('live-console');
    expect(consoleRegion).not.toBeVisible();

    const tabs = within(screen.getAllByRole('tablist')[0]).getAllByRole('tab');
    const consoleTab = tabs[tabs.length - 1];
    fireEvent.click(consoleTab);

    expect(consoleTab).toHaveAttribute('aria-selected', 'true');
    expect(consoleRegion).toBeVisible();
  });

  it.each([
    ['/tenant-management', TenantManagementPage],
    ['/help', HelpPage],
  ] as [string, React.ComponentType][])('%s renders as a standalone page', (_route, Page) => {
    render(<Page />);
    expect(screen.getAllByRole('heading').length).toBeGreaterThan(0);
  });
});
