import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// Mock Next.js navigation
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

import JitElevationPage from '@/app/admin/jit-elevation/page';
import RetainersAndSlaOperationsPage from '@/app/operations/retainers/page';
import G1LaunchGatePage from '@/app/admin/g1-gate/page';
import { ZoikoShieldApiClient } from '@/lib/api-client';

describe('Operations & Administrative Cockpits Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. JIT Privileged Access Elevation Cockpit (/admin/jit-elevation)', () => {
    it('renders JIT elevation cockpit, separation of duties policy, and seeded sessions', async () => {
      vi.spyOn(ZoikoShieldApiClient, 'getJitSessions').mockResolvedValueOnce([
        {
          sessionId: 'jit-sess-1001',
          operatorId: 'usr-analyst-01',
          targetTenantId: 'tenant-demo',
          elevatedRole: 'INCIDENT_COMMANDER',
          status: 'ACTIVE',
          clientIp: '192.168.1.104',
          statedPurpose: 'Emergency P1 Containment for Swift Transaction Anomaly',
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          hardwareStepUpVerified: true,
          peerApprover: 'usr-ciso-02',
        },
        {
          sessionId: 'jit-sess-1002',
          operatorId: 'usr-sre-03',
          targetTenantId: 'tenant-telecom',
          elevatedRole: 'SUPER_ADMIN',
          status: 'PENDING',
          clientIp: '10.200.4.12',
          statedPurpose: 'Post-Quantum Merkle Epoch Re-synchronization',
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          hardwareStepUpVerified: false,
        },
      ]);

      render(<JitElevationPage />);

      expect(
        screen.getAllByText(/Privileged Elevation & Dual-Approver Quorum/i)[0]
      ).toBeInTheDocument();

      expect(
        screen.getAllByText(/Separation of Duties Policy/i)[0]
      ).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getAllByText(/jit-sess-1001/i)[0]).toBeInTheDocument();
        expect(screen.getAllByText(/jit-sess-1002/i)[0]).toBeInTheDocument();
        expect(screen.getAllByText(/ACTIVE ELEVATION/i)[0]).toBeInTheDocument();
        expect(screen.getAllByText(/AWAITING PEER APPROVAL/i)[0]).toBeInTheDocument();
      });
    });

    it('opens elevation request modal on Request JIT Elevation button click', async () => {
      render(<JitElevationPage />);

      const requestBtn = screen.getByRole('button', { name: /Request JIT Elevation/i });
      fireEvent.click(requestBtn);

      expect(
        screen.getAllByText(/Submit JIT Privileged Elevation Request/i)[0]
      ).toBeInTheDocument();
    });
  });

  describe('2. Incident Response Retainer & SLA Operations Cockpit (/operations/retainers)', () => {
    it('renders retainer capacity meters, active SLA countdown clocks, and breach status', async () => {
      render(<RetainersAndSlaOperationsPage />);

      expect(
        screen.getAllByText(/Retainer Hours & Response SLA Cockpit/i)[0]
      ).toBeInTheDocument();

      expect(
        screen.getAllByText(/Contractual SLA Response Target Guarantee/i)[0]
      ).toBeInTheDocument();

      expect(
        screen.getAllByText(/ANNUAL INCLUDED HOURS/i)[0]
      ).toBeInTheDocument();

      expect(
        screen.getAllByText(/Swift Transaction Egress Anomaly/i)[0]
      ).toBeInTheDocument();

      expect(
        screen.getAllByText(/SIM-Swap Telemetry Interception on Gateway/i)[0]
      ).toBeInTheDocument();

      // Breach alert button for wo-2026-p1-002
      expect(
        screen.getByRole('button', { name: /Settle SLA Credit \(\$750\)/i })
      ).toBeInTheDocument();
    });
  });

  describe('3. G1 Multi-Approver Launch Gate Cockpit (/admin/g1-gate)', () => {
    it('renders all 8 canonical domain approvers with initial fail-closed status', async () => {
      vi.spyOn(ZoikoShieldApiClient, 'getG1Roster').mockResolvedValueOnce({
        gateStatus: 'PENDING_MULTI_APPROVER_SIGNOFF',
        allApproved: false,
        ratifiedApprovalsCount: 0,
        requiredApprovalsCount: 8,
        missingRoles: ['ciso', 'dpo', 'vp_eng', 'ai_risk_lead', 'qa_lead', 'sre_lead', 'product_lead', 'soc_lead'],
        approvers: [
          { roleId: 'ciso', roleTitle: 'Chief Information Security Officer (CISO)', ratified: false },
          { roleId: 'dpo', roleTitle: 'Data Protection Officer (DPO)', ratified: false },
          { roleId: 'vp_eng', roleTitle: 'VP of Engineering', ratified: false },
          { roleId: 'ai_risk_lead', roleTitle: 'AI Risk & Safety Governance Lead', ratified: false },
          { roleId: 'qa_lead', roleTitle: 'Quality Assurance & Release Lead', ratified: false },
          { roleId: 'sre_lead', roleTitle: 'Site Reliability Engineering Lead', ratified: false },
          { roleId: 'product_lead', roleTitle: 'Security Product Lead', ratified: false },
          { roleId: 'soc_lead', roleTitle: 'SOC Incident Commander', ratified: false },
        ],
      });

      render(<G1LaunchGatePage />);

      expect(
        screen.getAllByText(/G1 Launch Gate & Live Response Authority/i)[0]
      ).toBeInTheDocument();

      expect(
        screen.getAllByText(/FAIL-CLOSED \(SIMULATION ONLY\)/i)[0]
      ).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getAllByText(/Chief Information Security Officer \(CISO\)/i)[0]).toBeInTheDocument();
        expect(screen.getAllByText(/Data Protection Officer \(DPO\)/i)[0]).toBeInTheDocument();
        expect(screen.getAllByText(/VP of Engineering/i)[0]).toBeInTheDocument();
        expect(screen.getAllByText(/AI Risk & Safety Governance Lead/i)[0]).toBeInTheDocument();
        expect(screen.getAllByText(/0 \/ 8/i)[0]).toBeInTheDocument();
      });
    });
  });
});
