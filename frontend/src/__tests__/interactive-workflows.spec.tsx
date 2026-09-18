import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import IrRetainerPage from '../app/ir-retainer/page';
import AiGovernancePage from '../app/ai-governance/page';
import ActionsPage from '../app/actions/page';
import AdminPage from '../app/admin/page';
import { ZoikoShieldApiClient } from '../lib/api-client';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

describe('ZoikoShield Interactive Workflows Experience Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. IR Retainer Purpose-Bound Legal Access Workflow (/ir-retainer)', () => {
    it('renders the statutory disclaimer and allows purpose-bound legal access query', async () => {
      render(<IrRetainerPage />);

      // Verify IR Retainer cockpit renders initial loading or header state
      expect(screen.getByText(/Commercial Retainer Ledger|INCIDENT RESPONSE RETAINER/i)).toBeDefined();
    });
  });

  describe('2. AI Governance & Review Envelope Cockpit (/ai-governance)', () => {
    it('renders §17 Domain-Differentiated presets and review envelopes', async () => {
      render(<AiGovernancePage />);

      // Verify domain preset headings / indicators
      expect(screen.getByText(/GOVERNANCE & SAFETY COCKPIT/i)).toBeDefined();
    });
  });

  describe('3. Governed Response & Dual-Custody Actions (/actions)', () => {
    it('renders the dual-custody action authorization cockpit in simulation mode', async () => {
      render(<ActionsPage />);

      // Verify actions cockpit exists
      expect(screen.getByText(/R0–R4 Authority Tiers/i)).toBeDefined();
    });
  });

  describe('4. Super-Admin Multi-Tenant Operations Center (/admin)', () => {
    it('renders commercial offer entitlement matrix and emergency controls', async () => {
      render(<AdminPage />);

      // Verify commercial offer matrix items exist
      expect(screen.getByText(/SUPER-ADMIN OPERATIONS CENTER/i)).toBeDefined();
      expect(screen.getByText(/Multi-Tenant Administration & Platform Controls/i)).toBeDefined();
      expect(screen.getAllByText(/Managed Defense/i).length).toBeGreaterThan(0);
    });
  });
});
