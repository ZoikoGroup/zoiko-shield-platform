import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock EventSource for useEventStream
global.EventSource = vi.fn().mockImplementation(() => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  close: vi.fn(),
})) as any;

// Import route page components
import VerifyCertificatePage from '@/app/verify-certificate/page';
import IrRetainerPage from '@/app/ir-retainer/page';
import AuditPage from '@/app/audit/page';
import AlertsPage from '@/app/alerts/page';
import ActionsPage from '@/app/actions/page';
import ControlsPage from '@/app/controls/page';
import AiGovernancePage from '@/app/ai-governance/page';
import HuntingPage from '@/app/hunting/page';
import LedgerPage from '@/app/ledger/page';
import ConnectorsPage from '@/app/connectors/page';
import IngestionPage from '@/app/ingestion/page';
import PlatformAdminPage from '@/app/admin/page';
import DashboardPage from '@/app/page';
import CasesListPage from '@/app/cases/page';
import LoginPage from '@/app/login/page';
import RedTeamSimulatorPage from '@/app/red-team/page';
import JitElevationPage from '@/app/admin/jit/page';
import RetainersAndSlaOperationsPage from '@/app/operations/retainers/page';
import G1GatePage from '@/app/admin/g1-gate/page';
import JitElevationApprovalPage from '@/app/admin/jit-elevation/page';

describe('ZoikoShield Route Pages Smoke Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Verify Certificate Page (/verify-certificate)', () => {
    it('renders audit certificate verifier UI without throwing', () => {
      render(<VerifyCertificatePage />);
      expect(
        screen.getAllByText(/Compliance Audit Certificate Verifier/i)[0]
      ).toBeInTheDocument();
      expect(
        screen.getAllByText(/Load Certified Sample/i)[0]
      ).toBeInTheDocument();
    });
  });

  describe('2. IR Retainer & SLA Engine Page (/ir-retainer)', () => {
    it('renders IR retainer cockpit and handles loading / initial states', async () => {
      render(<IrRetainerPage />);
      // Can show either loading indicator or rendered retainer content
      await waitFor(() => {
        expect(
          screen.queryByText(/Incident Response Retainer/i) ||
          screen.queryByText(/Connecting to Commercial Retainer Ledger/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('3. Audit Package & Offline Verifier Page (/audit)', () => {
    it('renders audit package export and offline verifier interface', () => {
      render(<AuditPage />);
      expect(
        screen.getAllByText(/Audit Package Export & Offline Verifier/i)[0]
      ).toBeInTheDocument();
      expect(
        screen.getAllByText(/Generate Sealed Audit Package/i)[0]
      ).toBeInTheDocument();
    });
  });

  describe('4. Alerts Page (/alerts)', () => {
    it('renders security alerts stream cockpit', () => {
      render(<AlertsPage />);
      expect(screen.getAllByText(/Alerts/i)[0]).toBeInTheDocument();
    });
  });

  describe('5. Actions Cockpit Page (/actions)', () => {
    it('renders dual-custody action approvals with simulation notice', () => {
      render(<ActionsPage />);
      expect(screen.getAllByText(/Governed SOAR Response/i)[0]).toBeInTheDocument();
    });
  });

  describe('6. Controls Page (/controls)', () => {
    it('renders continuous compliance controls matrix', () => {
      render(<ControlsPage />);
      expect(screen.getAllByText(/Continuous Security Controls Matrix/i)[0]).toBeInTheDocument();
    });
  });

  describe('7. AI Governance Studio Page (/ai-governance)', () => {
    it('renders AI safety, incident lifecycle, review envelopes and drift studio', () => {
      render(<AiGovernancePage />);
      expect(screen.getAllByText(/AI Safety, Incident Lifecycle/i)[0]).toBeInTheDocument();
      expect(screen.getByText(/Grounding Gate Studio/i)).toBeInTheDocument();
      expect(screen.getByText(/AI Review Envelopes/i)).toBeInTheDocument();
    });
  });

  describe('8. Threat Hunting Copilot Page (/hunting)', () => {
    it('renders multi-hop threat hunting attack graph explorer', () => {
      render(<HuntingPage />);
      expect(screen.getAllByText(/Autonomous Threat Hunting Copilot/i)[0]).toBeInTheDocument();
    });
  });

  describe('9. Immutable Ledger Page (/ledger)', () => {
    it('renders tamper-evident evidence ledger and Merkle root', () => {
      render(<LedgerPage />);
      expect(screen.getAllByText(/Evidence Ledger/i)[0]).toBeInTheDocument();
    });
  });

  describe('10. Connectors Page (/connectors)', () => {
    it('renders connector ecosystem catalog with 3-tier certification badges', () => {
      render(<ConnectorsPage />);
      expect(screen.getAllByText(/Connector/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/P0 GA/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/P1 PREVIEW/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/EXPERIMENTAL/i)[0]).toBeInTheDocument();
    });
  });

  describe('11. Ingestion Page (/ingestion)', () => {
    it('renders real-time OCSF ingestion stream', () => {
      render(<IngestionPage />);
      expect(screen.getAllByText(/Ingestion/i)[0]).toBeInTheDocument();
    });
  });

  describe('12. Platform Super-Admin Page (/admin)', () => {
    it('renders multi-tenant administrative cockpit, circuit breakers, and commercial offers', () => {
      render(<PlatformAdminPage />);
      expect(screen.getByText(/Multi-Tenant Administration & Platform Controls/i)).toBeInTheDocument();
      expect(screen.getByText(/AI INFERENCE CIRCUIT BREAKER/i)).toBeInTheDocument();
      expect(screen.getByText(/INGESTION PIPELINE THROTTLER/i)).toBeInTheDocument();
      expect(screen.getByText(/SOAR PLAYBOOK AUTONOMOUS FREEZE/i)).toBeInTheDocument();
      expect(screen.getByText(/Tenant Commercial Offer Entitlement Matrix/i)).toBeInTheDocument();
      expect(screen.getByText(/Real-Time Resource Quotas & Metering Telemetry/i)).toBeInTheDocument();
    });
  });

  describe('13. Executive Operations Dashboard (/)', () => {
    it('renders overview dashboard, telemetry widgets, and status monitors', () => {
      render(<DashboardPage />);
      expect(screen.getByText(/ZoikoShield SecOps & Cryptographic Command Center/i)).toBeInTheDocument();
      expect(screen.getByText(/UNRESOLVED ALERTS/i)).toBeInTheDocument();
    });
  });

  describe('14. Cases & Incident Triage Page (/cases)', () => {
    it('renders incident case list and active case metrics', () => {
      render(<CasesListPage />);
      expect(screen.getByText(/Incident Workspace Directory/i)).toBeInTheDocument();
    });
  });

  describe('15. Authentication & Passkey Step-Up Page (/login)', () => {
    it('renders sign-in form with tenant selection and passkey option', () => {
      render(<LoginPage />);
      expect(screen.getByText(/ZoikoShield Authentication Gate/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Passkey/i)[0]).toBeInTheDocument();
    });
  });

  describe('16. Adversary Red-Team Simulator Page (/red-team)', () => {
    it('renders adversary replay scenarios and detection validation matrix', () => {
      render(<RedTeamSimulatorPage />);
      expect(screen.getByText(/Defensive Control Simulation & Replay Engine/i)).toBeInTheDocument();
      expect(screen.getByText(/Run Simulation Scenario/i)).toBeInTheDocument();
    });
  });

  describe('17. JIT Break-Glass Elevation Engine Page (/admin/jit)', () => {
    it('renders JIT elevation requests table, break-glass modal trigger, and active sessions', () => {
      render(<JitElevationPage />);
      expect(screen.getByText(/Platform Admin: Support Access & Dual-Approval JIT/i)).toBeInTheDocument();
      expect(screen.getByText(/Request JIT Elevation/i)).toBeInTheDocument();
    });
  });

  describe('18. Retainer & SLA Operations Cockpit (/operations/retainers)', () => {
    it('renders retainer hour burn meter and SLA breach tracking table', () => {
      render(<RetainersAndSlaOperationsPage />);
      expect(screen.getByText(/Retainer Hours & Response SLA Cockpit/i)).toBeInTheDocument();
      expect(screen.getByText(/ANNUAL INCLUDED HOURS/i)).toBeInTheDocument();
    });
  });

  describe('19. G1 Launch Gate Sign-Off Cockpit (/admin/g1-gate)', () => {
    it('renders 8-member stakeholder roster and G1 authorization status', () => {
      render(<G1GatePage />);
      expect(screen.getByText(/G1 Launch Gate & Live Response Authority/i)).toBeInTheDocument();
    });
  });

  describe('20. JIT Dual-Custody Approval Cockpit (/admin/jit-elevation)', () => {
    it('renders dual-custody authorization queue and session controls', () => {
      render(<JitElevationApprovalPage />);
      expect(screen.getByText(/Privileged Elevation & Dual-Approver Quorum/i)).toBeInTheDocument();
    });
  });
});
