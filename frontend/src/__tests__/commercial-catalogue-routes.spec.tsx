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

import PricingPage from '@/app/pricing/page';
import CommercialServicesPage from '@/app/services/page';
import SectorPacksPage from '@/app/sector-packs/page';
import CopilotPage from '@/app/copilot/page';
import GTMChecklistPage from '@/app/admin/gtm-checklist/page';

describe('Commercial Catalogue & Governance Routes Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Commercial Pricing & Band Sizing Page (/pricing)', () => {
    it('renders 4-tier plan ladder and mandatory anti-perverse billing disclaimer', async () => {
      render(<PricingPage />);

      expect(
        screen.getAllByText(/Outcome-Driven Security Plans/i)[0]
      ).toBeInTheDocument();

      // Anti-perverse billing & commercial sizing disclaimer
      expect(
        screen.getAllByText(/Commercial Sizing & Anti-Perverse Incentive Notice/i)[0]
      ).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getAllByText(/Shield Essential/i)[0]).toBeInTheDocument();
        expect(screen.getAllByText(/Shield Professional/i)[0]).toBeInTheDocument();
        expect(screen.getAllByText(/Shield Advanced/i)[0]).toBeInTheDocument();
        expect(screen.getAllByText(/Shield Enterprise/i)[0]).toBeInTheDocument();
      });

      // Live sizing calculator
      expect(
        screen.getAllByText(/Find Your Optimal Shield Band/i)[0]
      ).toBeInTheDocument();
    });
  });

  describe('2. Commercial Services & Capabilities Page (/services)', () => {
    it('renders 12 customer-visible services, capability domains, and evaluator probe', async () => {
      render(<CommercialServicesPage />);

      expect(
        screen.getAllByText(/Commercial Security Services & Capabilities/i)[0]
      ).toBeInTheDocument();

      expect(
        screen.getAllByText(/Taxonomy & Governance Integrity/i)[0]
      ).toBeInTheDocument();

      await waitFor(() => {
        expect(
          screen.getAllByText(/Managed Threat Detection & Rapid Response \(MDR\)/i)[0]
        ).toBeInTheDocument();
        expect(
          screen.getAllByText(/Post-Quantum Cryptographic Audit Ledger/i)[0]
        ).toBeInTheDocument();
        expect(
          screen.getAllByText(/EU DORA Digital Operational Resilience Evaluator/i)[0]
        ).toBeInTheDocument();
      });

      // Status badges
      expect(screen.getAllByText(/CORE ACTIVE/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/DEFERRED \(ADR-08\)/i).length).toBeGreaterThan(0);
    });
  });

  describe('3. Tailored Sector Defense Packs Page (/sector-packs)', () => {
    it('renders 6 sector packs with statutory caveats', async () => {
      render(<SectorPacksPage />);

      expect(
        screen.getAllByText(/Tailored Sector Defense Packs/i)[0]
      ).toBeInTheDocument();

      expect(
        screen.getAllByText(/Telecommunications & Critical Carrier Infrastructure/i)[0]
      ).toBeInTheDocument();
      expect(
        screen.getAllByText(/FinTech, Banking & High-Frequency Payment Networks/i)[0]
      ).toBeInTheDocument();
      expect(
        screen.getAllByText(/Healthcare, Life Sciences & Protected Health Data/i)[0]
      ).toBeInTheDocument();
      expect(
        screen.getAllByText(/Legal, Counsel-Controlled & Privileged Workflows/i)[0]
      ).toBeInTheDocument();

      // Statutory caveat box
      expect(
        screen.getAllByText(/Statutory Disclosure & Scope Boundary:/i)[0]
      ).toBeInTheDocument();
    });
  });

  describe('4. AI Security Copilot Page (/copilot)', () => {
    it('renders unbranded AI copilot across 6 operational patterns with 10-field review envelope', () => {
      render(<CopilotPage />);

      expect(
        screen.getAllByText(/ZoikoShield AI Security Copilot/i)[0]
      ).toBeInTheDocument();

      expect(
        screen.getAllByText(/Governance Rule CAT-02/i)[0]
      ).toBeInTheDocument();

      expect(
        screen.getAllByText(/10-FIELD DECISION REVIEW ENVELOPE/i)[0]
      ).toBeInTheDocument();

      // Mode selectors
      expect(screen.getAllByText(/1\. Investigate/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/2\. Assure/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/3\. Respond/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/4\. Report/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/5\. Develop/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/6\. Navigate/i)[0]).toBeInTheDocument();
    });
  });

  describe('5. Section 12 Pre-Flight GTM Checklist Page (/admin/gtm-checklist)', () => {
    it('renders 12-item GTM verification cockpit with 100% pass status', async () => {
      render(<GTMChecklistPage />);

      expect(
        screen.getAllByText(/Section 12 Pre-Flight GTM Checklist/i)[0]
      ).toBeInTheDocument();

      expect(
        screen.getAllByText(/12 \/ 12 Pre-Flight Rules Verified & Enforced/i)[0]
      ).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getAllByText(/CAT-01/i)[0]).toBeInTheDocument();
        expect(screen.getAllByText(/CAT-02/i)[0]).toBeInTheDocument();
        expect(screen.getAllByText(/PR-01/i)[0]).toBeInTheDocument();
        expect(screen.getAllByText(/PR-02/i)[0]).toBeInTheDocument();
        expect(screen.getAllByText(/CON-01/i)[0]).toBeInTheDocument();
        expect(screen.getAllByText(/GOV-01/i)[0]).toBeInTheDocument();
        expect(screen.getAllByText(/SVC-01/i)[0]).toBeInTheDocument();
      });
    });
  });
});
