import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ZoikoShieldApiClient } from '@/lib/api-client';
import PolicyManagementPage from '@/app/policies/page';

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/policies',
  useSearchParams: () => new URLSearchParams(),
}));

const mockPolicies = [
  {
    id: 'pol-2026-09-001',
    tenantId: 'tenant-demo',
    policyName: 'Zero-Trust JIT Admin Escalation Policy',
    domain: 'IAM' as const,
    version: 'v2.4.1',
    status: 'PENDING_APPROVAL' as const,
    stagedEnvironment: 'staging-eu-west3',
    canaryPercentage: 10,
    author: 'security-architect@zoikoshield.corp',
    approvers: ['soc-lead@zoikoshield.corp'],
    createdAt: '2026-09-24T18:32:00.000Z',
    updatedAt: '2026-09-24T18:32:00.000Z',
    commitHash: '7f9a2c14e0b',
    diffSummary: 'Enforces 4-eyes approval on R3 actions.',
    diffContent: {
      previous: 'max_session_ttl_minutes: 60',
      proposed: 'max_session_ttl_minutes: 30',
    },
  },
  {
    id: 'pol-2026-09-002',
    tenantId: 'tenant-demo',
    policyName: 'Regional EU Cell Sovereignty Fence',
    domain: 'RESIDENCY' as const,
    version: 'v3.1.0',
    status: 'ACTIVE' as const,
    stagedEnvironment: 'production-eu-west3',
    canaryPercentage: 100,
    author: 'dpo-compliance@zoikoshield.corp',
    approvers: ['ciso@zoikoshield.corp', 'lead-sre@zoikoshield.corp'],
    createdAt: '2026-09-22T10:15:00.000Z',
    updatedAt: '2026-09-22T10:15:00.000Z',
    commitHash: '3a88d72e911',
    diffSummary: 'Strict fail-closed cross-border route dropping.',
    diffContent: {
      previous: 'fail_open_on_outage: true',
      proposed: 'fail_open_on_outage: false',
    },
  },
];

describe('Contract W12 • Policy Lifecycle Management Cockpit (/policies)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads policy catalog from API and renders diff view and dual-custody status', async () => {
    vi.spyOn(ZoikoShieldApiClient, 'getPolicies').mockResolvedValue(mockPolicies);

    render(<PolicyManagementPage />);

    await waitFor(() => {
      expect(screen.getByText(/Policy & Configuration Lifecycle Management/i)).toBeInTheDocument();
      expect(screen.getAllByText('Zero-Trust JIT Admin Escalation Policy').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Regional EU Cell Sovereignty Fence').length).toBeGreaterThanOrEqual(1);
    });

    // Check YAML diff display
    expect(screen.getByText(/BASELINE \(Previous Active\)/i)).toBeInTheDocument();
    expect(screen.getByText(/PROPOSED \(Current Spec\)/i)).toBeInTheDocument();
  });

  it('submits 4-eyes dual-custody approval and updates policy status', async () => {
    vi.spyOn(ZoikoShieldApiClient, 'getPolicies').mockResolvedValue(mockPolicies);
    const approveSpy = vi.spyOn(ZoikoShieldApiClient, 'approvePolicy').mockResolvedValue({
      ...mockPolicies[0],
      status: 'ACTIVE',
      approvers: ['soc-lead@zoikoshield.corp', 'ciso-approver@zoikoshield.corp'],
      updatedAt: new Date().toISOString(),
    });

    render(<PolicyManagementPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Zero-Trust JIT Admin Escalation Policy').length).toBeGreaterThanOrEqual(1);
    });

    const approveButton = screen.getByRole('button', { name: /Dual-Sign & Promote/i });
    expect(approveButton).toBeInTheDocument();

    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(approveSpy).toHaveBeenCalledWith('pol-2026-09-001', expect.any(String));
      expect(screen.getByText(/signed\. Current approvers/i)).toBeInTheDocument();
    });
  });

  it('opens canary staging modal and applies rollout percentage', async () => {
    vi.spyOn(ZoikoShieldApiClient, 'getPolicies').mockResolvedValue(mockPolicies);
    const stageSpy = vi.spyOn(ZoikoShieldApiClient, 'stagePolicy').mockResolvedValue({
      ...mockPolicies[0],
      stagedEnvironment: 'staging-us-east1',
      canaryPercentage: 50,
      status: 'STAGED',
      updatedAt: new Date().toISOString(),
    });

    render(<PolicyManagementPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Zero-Trust JIT Admin Escalation Policy').length).toBeGreaterThanOrEqual(1);
    });

    const stageModalTrigger = screen.getByRole('button', { name: /Stage Canary Rollout/i });
    fireEvent.click(stageModalTrigger);

    await waitFor(() => {
      expect(screen.getByText('Stage Canary Policy Rollout')).toBeInTheDocument();
    });

    const applyButton = screen.getByRole('button', { name: /Apply Canary Rollout/i });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(stageSpy).toHaveBeenCalledWith(
        'pol-2026-09-001',
        expect.any(String),
        expect.any(Number),
      );
      expect(screen.getByText(/staged to/i)).toBeInTheDocument();
    });
  });

  it('opens rollback modal and executes atomic rollback with auditable justification', async () => {
    vi.spyOn(ZoikoShieldApiClient, 'getPolicies').mockResolvedValue(mockPolicies);
    const rollbackSpy = vi.spyOn(ZoikoShieldApiClient, 'rollbackPolicy').mockResolvedValue({
      ...mockPolicies[1],
      status: 'ROLLED_BACK',
      canaryPercentage: 0,
      reversalReason: 'Canary anomaly detected in production cell',
      updatedAt: new Date().toISOString(),
    });

    render(<PolicyManagementPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Regional EU Cell Sovereignty Fence').length).toBeGreaterThanOrEqual(1);
    });

    // Select second policy (ACTIVE) from list
    const secondPolicyCards = screen.getAllByText('Regional EU Cell Sovereignty Fence');
    fireEvent.click(secondPolicyCards[0]);

    const rollbackButton = screen.getByRole('button', { name: /Atomic Rollback/i });
    fireEvent.click(rollbackButton);

    await waitFor(() => {
      expect(screen.getByText('Execute Atomic Policy Rollback')).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: /Confirm Instant Rollback/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(rollbackSpy).toHaveBeenCalledWith('pol-2026-09-002', expect.any(String));
      expect(screen.getByText(/instantly rolled back to 0% canary/i)).toBeInTheDocument();
    });
  });
});
