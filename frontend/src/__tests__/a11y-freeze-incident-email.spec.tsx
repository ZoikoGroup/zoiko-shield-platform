import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axe from 'axe-core';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/freeze',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

import { ZoikoShieldApiClient } from '@/lib/api-client';
import FreezeCenterPage from '@/app/freeze/page';
import IncidentCommandPage from '@/app/cases/incidents/command/page';
import EmailActionsPage from '@/app/email/actions/page';

async function runAxe(container: HTMLElement) {
  return axe.run(container, {
    rules: {
      // jsdom does not compute visual CSS colors/styles
      'color-contrast': { enabled: false },
      // page components render inside the app shell layout
      region: { enabled: false },
    },
  });
}

describe('Accessibility (axe-core WCAG 2.1 AA) — Freeze Center, Incident Command & Email Actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('Freeze Center (/freeze) passes axe checks in operational and active-lockdown states and toggles freeze cleanly', async () => {
    vi.spyOn(ZoikoShieldApiClient, 'getFreezeStatusSOAR').mockResolvedValue({
      frozen: false,
      status: 'OPERATIONAL',
      freeze: null,
    });
    vi.spyOn(ZoikoShieldApiClient, 'listEmailActions').mockResolvedValue({
      phase2ActionsLocked: true,
      proposals: [
        {
          id: 'prop-1',
          provider: 'MICROSOFT_365',
          requested_action: 'QUARANTINE_MESSAGE',
          risk_class: 'R3',
          status: 'AUTHORISED',
        },
      ],
    });
    const freezeSpy = vi
      .spyOn(ZoikoShieldApiClient, 'freezeSOAR')
      .mockResolvedValue({
        frozen: true,
        mode: 'EMERGENCY_LOCKDOWN',
        freezeId: 'frz-test-001',
        initiatedBy: 'sec-director-1',
        timestamp: '2026-11-24T04:00:00Z',
      });
    const releaseSpy = vi
      .spyOn(ZoikoShieldApiClient, 'releaseFreezeSOAR')
      .mockResolvedValue({
        frozen: false,
        releasedAt: '2026-11-24T04:05:00Z',
      });

    const { container } = render(<FreezeCenterPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/No Active Tenant Freeze/i),
      ).toBeInTheDocument();
    });

    // 1. Operational state has zero axe violations
    const opResults = await runAxe(container);
    expect(opResults.violations).toEqual([]);

    // 2. Submitting without justification announces accessible alert
    fireEvent.click(
      screen.getByRole('button', { name: /Engage Emergency Freeze/i }),
    );
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /justification is required/i,
      );
    });

    // 3. Engaging freeze updates live status and passes axe checks
    fireEvent.change(
      screen.getByLabelText(/Justification & Incident Reference/i),
      { target: { value: 'INC-2026-77: Anomalous mailbox write spike' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Engage Emergency Freeze/i }),
    );

    await waitFor(() => {
      expect(freezeSpy).toHaveBeenCalledWith(
        'TENANT',
        'INC-2026-77: Anomalous mailbox write spike',
      );
      expect(
        screen.getByText(/Execution Freeze Active/i),
      ).toBeInTheDocument();
    });

    const frozenResults = await runAxe(container);
    expect(frozenResults.violations).toEqual([]);

    // 4. Releasing freeze restores operational state
    fireEvent.click(
      screen.getByRole('button', { name: /Release Tenant Freeze/i }),
    );
    await waitFor(() => {
      expect(releaseSpy).toHaveBeenCalledWith('frz-test-001');
      expect(
        screen.getByText(/Freeze released and recorded/i),
      ).toBeInTheDocument();
    });
  });

  it('Incident Command (/cases/incidents/command) passes axe checks with active incident, SLA clock, decisions, and evidence table', async () => {
    const jsonResponse = (payload: unknown) =>
      new Response(JSON.stringify({ statusCode: 200, data: payload }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes('/api/v1/cases?')) {
        return jsonResponse([
          {
            id: 'case-inc-01',
            title: 'BEC Wire Fraud Active Incident',
            severity: 'CRITICAL',
            priority: 'P1',
            status: 'INVESTIGATING',
            region: 'eu-west-1',
            environment_id: 'prod-eu',
            owner_id: 'analyst-lead-1',
            created_by: 'detector-email',
            created_at: '2026-11-24T02:00:00Z',
          },
        ]);
      }
      if (path.endsWith('/api/v1/cases/case-inc-01')) {
        return jsonResponse({
          id: 'case-inc-01',
          title: 'BEC Wire Fraud Active Incident',
          severity: 'CRITICAL',
          priority: 'P1',
          status: 'INVESTIGATING',
          region: 'eu-west-1',
          environment_id: 'prod-eu',
          owner_id: 'analyst-lead-1',
          created_by: 'detector-email',
          created_at: '2026-11-24T02:00:00Z',
        });
      }
      if (path.endsWith('/timeline')) {
        return jsonResponse([
          {
            id: 'tl-1',
            entry_type: 'CONTAINMENT',
            actor_id: 'analyst-lead-1',
            occurred_at: '2026-11-24T02:10:00Z',
            title: 'Contained phishing sender',
            summary: 'Queued email quarantine proposal',
            evidence_ref: 'ev-linked-1',
          },
        ]);
      }
      if (path.endsWith('/decisions')) {
        return jsonResponse([
          {
            id: 'dec-1',
            decision_type: 'CONTAINMENT',
            decision: 'QUARANTINE_MESSAGE',
            rationale: 'Verified spoofing headers and malicious invoice hash',
            actor_id: 'director-1',
            evidence_refs: '["ev-linked-1"]',
            policy_version: 'v2026.11.01',
            created_at: '2026-11-24T02:12:00Z',
          },
        ]);
      }
      if (path.endsWith('/notes')) {
        return jsonResponse([
          {
            id: 'note-1',
            author_id: 'comms-1',
            content: 'Customer CISO notified of active investigation.',
            classification: 'CUSTOMER_VISIBLE',
            created_at: '2026-11-24T02:15:00Z',
          },
        ]);
      }
      if (path.endsWith('/sla')) {
        return jsonResponse({
          case_id: 'case-inc-01',
          severity: 'CRITICAL',
          coverage_tier: '24x7',
          target_response_minutes: 15,
          status: 'RUNNING',
          started_at: '2026-11-24T02:00:00Z',
          total_paused_ms: 0,
        });
      }
      if (path.endsWith('/evidence')) {
        return jsonResponse([
          {
            id: 'ev-row-1',
            evidence_id: 'ev-linked-1',
            relationship: 'PRIMARY_ARTIFACT',
            added_by: 'analyst-lead-1',
            added_at: '2026-11-24T02:05:00Z',
          },
        ]);
      }
      return jsonResponse([]);
    });

    const { container } = render(<IncidentCommandPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/BEC Wire Fraud Active Incident/i),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole('link', { name: /Freeze Center/i }),
    ).toHaveAttribute('href', '/freeze');

    const results = await runAxe(container);
    expect(results.violations).toEqual([]);
  });

  it('Email Actions (/email/actions) passes axe checks with proposals, non-success disclosures, and Freeze Center link', async () => {
    vi.spyOn(ZoikoShieldApiClient, 'listEmailActions').mockResolvedValue({
      phase2ActionsLocked: false,
      proposals: [
        {
          id: 'prop-a11y-1',
          provider: 'MICROSOFT_365',
          requested_action: 'QUARANTINE_MESSAGE',
          risk_class: 'R3',
          status: 'DRY_RUN',
          initiated_by: 'analyst-1',
          approved_by: 'director-1',
        },
      ],
    });

    const { container } = render(<EmailActionsPage />);
    await waitFor(() => {
      expect(screen.getByText(/DRY_RUN/)).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Dry-run completed: provider endpoint and target reference were validated/i),
    ).toBeInTheDocument();

    const results = await runAxe(container);
    expect(results.violations).toEqual([]);
  });
});
