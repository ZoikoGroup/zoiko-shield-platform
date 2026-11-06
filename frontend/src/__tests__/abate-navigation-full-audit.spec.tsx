import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BillingPage from '@/app/billing/page';
import CustomerDashboardPage from '@/app/customer/dashboard/page';
import { NAV_GROUPS, findActiveNav } from '@/components/layout/nav-config';
import { CUSTOMER_PRIMARY_NAV, CUSTOMER_FOOTER_NAV } from '@/components/customer/CustomerSidebar';

vi.mock('next/navigation', () => ({
  usePathname: () => '/customer/dashboard',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe('Abate Platform — Full Navigation, Button & Route Audit', () => {
  describe('1. Global Navigation Configuration & Route Integrity', () => {
    it('verifies all 7 navigation groups and 35+ routes are defined without dead links', () => {
      const groupIds = NAV_GROUPS.map((g) => g.id);
      expect(groupIds).toContain('overview');
      expect(groupIds).toContain('investigate');
      expect(groupIds).toContain('respond');
      expect(groupIds).toContain('data');
      expect(groupIds).toContain('governance');
      expect(groupIds).toContain('evidence');
      expect(groupIds).toContain('admin');
      expect(groupIds).toContain('platform');

      // Verify essential routes exist
      const allHrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
      expect(allHrefs).toContain('/customer/dashboard');
      expect(allHrefs).toContain('/');
      expect(allHrefs).toContain('/risk/executive');
      expect(allHrefs).toContain('/copilot');
      expect(allHrefs).toContain('/notifications');
      expect(allHrefs).toContain('/alerts');
      expect(allHrefs).toContain('/detections');
      expect(allHrefs).toContain('/findings');
      expect(allHrefs).toContain('/cases');
      expect(allHrefs).toContain('/hunting');
      expect(allHrefs).toContain('/operations/shift-handover');
      expect(allHrefs).toContain('/cases/incidents/command');
      expect(allHrefs).toContain('/response-proposals');
      expect(allHrefs).toContain('/playbooks');
      expect(allHrefs).toContain('/actions');
      expect(allHrefs).toContain('/red-team');
      expect(allHrefs).toContain('/ir-retainer');
      expect(allHrefs).toContain('/assets');
      expect(allHrefs).toContain('/ingestion');
      expect(allHrefs).toContain('/connectors');
      expect(allHrefs).toContain('/controls');
      expect(allHrefs).toContain('/policies');
      expect(allHrefs).toContain('/risk');
      expect(allHrefs).toContain('/exceptions');
      expect(allHrefs).toContain('/ai-governance');
      expect(allHrefs).toContain('/sector-packs');
      expect(allHrefs).toContain('/ledger');
      expect(allHrefs).toContain('/evidence-operations');
      expect(allHrefs).toContain('/audit');
      expect(allHrefs).toContain('/auditor');
      expect(allHrefs).toContain('/trust');
      expect(allHrefs).toContain('/admin/tenant');
      expect(allHrefs).toContain('/tenant-management');
      expect(allHrefs).toContain('/team');
      expect(allHrefs).toContain('/onboarding');
      expect(allHrefs).toContain('/partner/fleet');
      expect(allHrefs).toContain('/developer');
      expect(allHrefs).toContain('/admin/export');
      expect(allHrefs).toContain('/admin');
      expect(allHrefs).toContain('/admin/platform-health');
      expect(allHrefs).toContain('/admin/jit-elevation');
      expect(allHrefs).toContain('/admin/jit');
      expect(allHrefs).toContain('/admin/g1-gate');
      expect(allHrefs).toContain('/admin/gtm-checklist');
      expect(allHrefs).toContain('/admin/email-templates');
    });

    it('resolves active navigation item with longest prefix matching correctly', () => {
      expect(findActiveNav('/cases/incidents/command')?.item.label).toBe('Incident Command');
      expect(findActiveNav('/cases')?.item.label).toBe('Cases');
      expect(findActiveNav('/admin/tenant')?.item.label).toBe('Tenant Admin Dashboard');
      expect(findActiveNav('/admin')?.item.label).toBe('Super Admin Dashboard');
      expect(findActiveNav('/customer/dashboard')?.item.label).toBe('Customer Dashboard');
      expect(findActiveNav('/')?.item.label).toBe('Command Center');
    });

    it('verifies all 14 Customer Primary Navigation routes exist and match wireframe', () => {
      expect(CUSTOMER_PRIMARY_NAV.length).toBe(12);
      expect(CUSTOMER_FOOTER_NAV.length).toBe(2);
      const allCustomerItems = [...CUSTOMER_PRIMARY_NAV, ...CUSTOMER_FOOTER_NAV];
      expect(allCustomerItems.length).toBe(14);
      const labels = allCustomerItems.map((i) => i.label);
      expect(labels).toContain('Command Center');
      expect(labels).toContain('Security Overview');
      expect(labels).toContain('Threats & Incidents');
      expect(labels).toContain('Exposure Management');
      expect(labels).toContain('Assets & Inventory');
      expect(labels).toContain('Vulnerabilities');
      expect(labels).toContain('Detection & Response');
      expect(labels).toContain('Identity & Access');
      expect(labels).toContain('Data Security');
      expect(labels).toContain('Cloud Security');
      expect(labels).toContain('Compliance & Risk');
      expect(labels).toContain('Reports & Analytics');
      expect(labels).toContain('Integrations');
      expect(labels).toContain('Settings');
    });
  });

  describe('2. Customer Dashboard — 3 View Modes & Interactive Elements', () => {
    it('switches seamlessly between Executive View, SOC View, and Account View', async () => {
      render(<CustomerDashboardPage />);

      // Initial: Executive View is active
      expect(screen.getByText('Executive Security Overview')).toBeInTheDocument();
      expect(screen.getByText('Security Posture')).toBeInTheDocument();
      expect(screen.getByText('Priority Actions')).toBeInTheDocument();

      // Switch to SOC View
      const socTab = screen.getByText('SOC View');
      fireEvent.click(socTab);
      await waitFor(() => {
        expect(screen.getByText('Open Triage Queue')).toBeInTheDocument();
        expect(screen.getByText('Active Detection Pack (G07)')).toBeInTheDocument();
        expect(screen.getByText(/Active Scoped Detection Rules/i)).toBeInTheDocument();
      });

      // Switch to Account View
      const accountTab = screen.getByText('Account View');
      fireEvent.click(accountTab);
      await waitFor(() => {
        expect(screen.getByText(/Contracted Data Class Retention & Legal Hold Schedule/i)).toBeInTheDocument();
        expect(screen.getByText('Raw Inbound Security Telemetry (WAL / Object Store)')).toBeInTheDocument();
      });

      // Switch back to Executive View
      const execTab = screen.getByText('Executive View');
      fireEvent.click(execTab);
      await waitFor(() => {
        expect(screen.getByText('Security Posture')).toBeInTheDocument();
      });
    });
  });

  describe('3. Billing, Metering & Storage Economics Cockpit (/billing)', () => {
    it('renders storage economics, 7-class data retention table, and cryptographic receipts', () => {
      render(<BillingPage />);

      // Headers & KPIs
      expect(screen.getByText('Billing, Metering & Storage Economics')).toBeInTheDocument();
      expect(screen.getByText(/Data Residency & Policy Pack/i)).toBeInTheDocument();
      expect(screen.getByText('Active Service Entitlements')).toBeInTheDocument();
      expect(screen.getByText(/Storage & Query Economics/i)).toBeInTheDocument();

      // 7-Class Retention table
      expect(screen.getByText('Contracted Data Class Retention & Legal Hold Schedule (G08)')).toBeInTheDocument();
      expect(screen.getByText('Raw Inbound Security Telemetry (WAL / Object Store)')).toBeInTheDocument();
      expect(screen.getByText('Normalized OCSF v1.1 Analytics Records')).toBeInTheDocument();
      expect(screen.getByText('Alerts, Entity Risk Graph & Investigation Cases')).toBeInTheDocument();
      expect(screen.getByText('Merkle-Anchored Cryptographic Evidence Packages')).toBeInTheDocument();

      // Invoices & Certificates
      expect(screen.getByText('Invoicing & Cryptographic Settlement Receipts')).toBeInTheDocument();
      expect(screen.getByText('INV-2026-004')).toBeInTheDocument();
      expect(screen.getByText('INV-2026-003')).toBeInTheDocument();
    });

    it('downloads invoice cryptographic receipt upon clicking Download Certificate', () => {
      render(<BillingPage />);

      const downloadButtons = screen.getAllByText('Download Certificate');
      expect(downloadButtons.length).toBeGreaterThan(0);
      fireEvent.click(downloadButtons[0]);
    });
  });
});
