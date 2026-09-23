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
import { ZoikoShieldApiClient } from '@/lib/api-client';

describe('Commercial Catalogue & Governance Routes Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Commercial Pricing & Band Sizing Page (/pricing)', () => {
    it('renders 4-tier plan ladder and mandatory anti-perverse billing disclaimer', async () => {
      vi.spyOn(ZoikoShieldApiClient, 'getPlanTiers').mockResolvedValueOnce([
        {
          key: 'SHIELD_ESSENTIAL',
          displayName: 'Shield Essential',
          tagline: 'Foundational MDR',
          description: 'For growing organizations',
          pricing: { monthlyUsd: null, annualBilledMonthlyUsd: null, isContractOnly: true, currency: 'USD' },
          allocations: { maxProtectedAssets: 250, includedTelemetryGbPerDay: 25, incidentResponseSlaHours: null, retentionDays: 90, includedRetainerHoursPerYear: 0 },
          includedOffers: ['MANAGED_DEFENSE'],
          highlightedFeatures: ['250 Protected Assets'],
          governanceFeatures: ['Anti-Perverse Billing Guard'],
          supportModel: 'Standard 8x5',
        },
        {
          key: 'SHIELD_PROFESSIONAL',
          displayName: 'Shield Professional',
          tagline: 'Advanced SecOps',
          description: 'For mid-market enterprises',
          pricing: { monthlyUsd: null, annualBilledMonthlyUsd: null, isContractOnly: true, currency: 'USD' },
          allocations: { maxProtectedAssets: 1000, includedTelemetryGbPerDay: 100, incidentResponseSlaHours: null, retentionDays: 365, includedRetainerHoursPerYear: 20 },
          includedOffers: ['MANAGED_DEFENSE'],
          highlightedFeatures: ['1000 Protected Assets'],
          governanceFeatures: ['Decision Envelope'],
          supportModel: 'Extended 16x7',
        },
        {
          key: 'SHIELD_ADVANCED',
          displayName: 'Shield Advanced',
          tagline: 'Full-Spectrum Defense',
          description: 'For highly regulated institutions',
          pricing: { monthlyUsd: null, annualBilledMonthlyUsd: null, isContractOnly: true, currency: 'USD' },
          allocations: { maxProtectedAssets: 5000, includedTelemetryGbPerDay: 500, incidentResponseSlaHours: null, retentionDays: 730, includedRetainerHoursPerYear: 50 },
          includedOffers: ['MANAGED_DEFENSE'],
          highlightedFeatures: ['5000 Protected Assets'],
          governanceFeatures: ['Signed Receipts'],
          supportModel: 'Dedicated Lead',
        },
        {
          key: 'SHIELD_ENTERPRISE',
          displayName: 'Shield Enterprise',
          tagline: 'Sovereign Cells',
          description: 'For multinational conglomerates',
          pricing: { monthlyUsd: null, annualBilledMonthlyUsd: null, isContractOnly: true, currency: 'USD' },
          allocations: { maxProtectedAssets: null, includedTelemetryGbPerDay: null, incidentResponseSlaHours: null, retentionDays: 2555, includedRetainerHoursPerYear: 100 },
          includedOffers: ['MANAGED_DEFENSE'],
          highlightedFeatures: ['Custom Assets'],
          governanceFeatures: ['Bespoke Auditing'],
          supportModel: 'White-Glove Named',
        },
      ]);

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

    it('defensively handles null or non-array API response without throwing plans.map error', async () => {
      vi.spyOn(ZoikoShieldApiClient, 'getPlanTiers').mockResolvedValueOnce(null as any);

      const { container } = render(<PricingPage />);

      expect(
        screen.getAllByText(/Outcome-Driven Security Plans/i)[0]
      ).toBeInTheDocument();

      // Verify the component renders without crashing
      await waitFor(() => {
        expect(container).toBeDefined();
      });
    });

    it('defensively handles rejected API calls without unhandled runtime exceptions', async () => {
      vi.spyOn(ZoikoShieldApiClient, 'getPlanTiers').mockRejectedValueOnce(new Error('Network error'));

      const { container } = render(<PricingPage />);

      expect(
        screen.getAllByText(/Outcome-Driven Security Plans/i)[0]
      ).toBeInTheDocument();

      await waitFor(() => {
        expect(container).toBeDefined();
      });
    });
  });

  describe('2. Commercial Services & Capabilities Page (/services)', () => {
    it('renders 12 customer-visible services, capability domains, and evaluator probe', async () => {
      vi.spyOn(ZoikoShieldApiClient, 'getPublicServices').mockResolvedValueOnce([
        {
          serviceId: 'SVC-01',
          serviceName: 'Managed Threat Detection & Rapid Response (MDR)',
          category: 'CORE_SECURITY',
          publicOutcomeDescription: 'Continuous 24/7/365 managed threat detection',
          status: 'CORE',
          substantiatingComponents: ['shield-core', 'shield-ingest'],
          includedCapabilities: ['CAP-01', 'CAP-02'],
          pricingTierMinimum: 'ESSENTIAL',
        },
        {
          serviceId: 'SVC-02',
          serviceName: 'Post-Quantum Cryptographic Audit Ledger',
          category: 'TRUST_ASSURANCE',
          publicOutcomeDescription: 'Tamper-evident audit ledger',
          status: 'CORE',
          substantiatingComponents: ['shield-anchor'],
          includedCapabilities: ['CAP-03'],
          pricingTierMinimum: 'ESSENTIAL',
        },
        {
          serviceId: 'SVC-03',
          serviceName: 'EU DORA Digital Operational Resilience Evaluator',
          category: 'CONTINUOUS_COMPLIANCE',
          publicOutcomeDescription: 'Resilience evaluator',
          status: 'DEFERRED',
          substantiatingComponents: ['shield-core'],
          includedCapabilities: ['CAP-04'],
          pricingTierMinimum: 'ADVANCED',
        },
      ]);
      vi.spyOn(ZoikoShieldApiClient, 'getCapabilityDomains').mockResolvedValueOnce([
        {
          domainId: 'DOM-01',
          domainName: 'Core Threat Operations',
          description: 'Threat detection and incident containment',
          totalCapabilities: 4,
          coreCount: 4,
          controlledCount: 0,
          gatedCount: 0,
          deferredCount: 0,
          items: [
            {
              id: 'CAP-01',
              name: 'OCSF Telemetry Stream',
              domain: 'Core Threat Operations',
              customerService: 'SVC-01',
              status: 'CORE',
              substantiatingSatellites: ['shield-ingest'],
              governanceRationale: 'Active in production',
            },
          ],
        },
      ]);

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
        screen.getAllByText(/Telecom & MVNO/i)[0]
      ).toBeInTheDocument();
      expect(
        screen.getAllByText(/Financial Services & FinTech/i)[0]
      ).toBeInTheDocument();
      expect(
        screen.getAllByText(/Healthcare & Life Sciences/i)[0]
      ).toBeInTheDocument();
      expect(
        screen.getAllByText(/Legal & Professional Services/i)[0]
      ).toBeInTheDocument();
      expect(
        screen.getAllByText(/SaaS & Digital Platforms/i)[0]
      ).toBeInTheDocument();
      expect(
        screen.getAllByText(/Public Sector \/ Critical-Infrastructure-Aligned/i)[0]
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
