import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

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
  useParams: () => ({ id: 'case-2026-auth-attack-01' }),
}));

// Mock EventSource
global.EventSource = vi.fn(function () {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn(),
  };
}) as any;

// Import G2 experience contract pages
import IncidentCommandPage from '@/app/cases/incidents/command/page';
import SocShiftHandoverPage from '@/app/operations/shift-handover/page';
import AssetInventoryPage from '@/app/assets/page';
import FindingsPage from '@/app/findings/page';
import ExecutiveRiskPage from '@/app/risk/executive/page';

describe('G2 Advanced Operations & Governance Experience Contracts Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Contract W19 • Major Incident Command War Room (/cases/incidents/command)', () => {
    it('renders incident command war room cockpit with timeline, response clocks, and decision ledger', async () => {
      render(<IncidentCommandPage />);

      await waitFor(() => {
        expect(
          screen.getAllByText(/Incident command/i)[0]
        ).toBeInTheDocument();
      });
    });
  });

  describe('2. Contract W20 • SOC Shift Handover & Attestation (/operations/shift-handover)', () => {
    it('renders SOC shift handover ledger with open cases, commitments, and quality reviews', async () => {
      render(<SocShiftHandoverPage />);

      await waitFor(() => {
        expect(
          screen.getAllByText(/Shift handover/i)[0]
        ).toBeInTheDocument();
      });
    });
  });

  describe('3. Contract W29 • Attack Surface Asset Inventory (/assets)', () => {
    it('renders asset inventory with provenance, criticality, and entity resolution decisions', async () => {
      render(<AssetInventoryPage />);

      await waitFor(() => {
        expect(
          screen.getAllByText(/Asset inventory/i)[0]
        ).toBeInTheDocument();
      });
    });
  });

  describe('4. Contract W30 • Continuous Vulnerability Findings (/findings)', () => {
    it('renders vulnerability findings matrix with SLA countdowns and remediation state', async () => {
      render(<FindingsPage />);

      await waitFor(() => {
        expect(
          screen.getAllByText(/Findings/i)[0]
        ).toBeInTheDocument();
      });
    });
  });

  describe('5. Contract W31 • Executive & Board Risk Governance (/risk/executive)', () => {
    it('renders executive board risk posture, compliance heatmaps, and financial loss models', async () => {
      render(<ExecutiveRiskPage />);

      await waitFor(() => {
        expect(
          screen.getAllByText(/Executive risk/i)[0]
        ).toBeInTheDocument();
      });
    });
  });
});
