/**
 * BUG-02: Findings page counters show "unknown" / grid shows "No findings match".
 * BUG-03: Executive Risk metrics show "unknown".
 *
 * Root cause: useContractSources read tenantId/sessionToken only from useDemoState.
 * After sanitizeBrowserState strips a real login session, tenantId becomes "" and
 * requests are sent without x-tenant-id → backend returns 401/403 → all tiles
 * fall through to the "unknown" branch.
 *
 * Secondary: `summary ? 0 : undefined` evaluated `undefined` when summary was null
 * (source failed), so even after the primary fix, a genuinely empty estate would
 * show "unknown" rather than 0.
 *
 * Fix: useContractSources now reads from localStorage → cookies → useDemoState
 * (matching backend.ts). Metric expressions now guard on source.ok rather than
 * the data object being truthy.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ── Next.js stubs ──────────────────────────────────────────────────────────────
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// ── Pages under test ───────────────────────────────────────────────────────────
import FindingsPage from '@/app/findings/page';
import ExecutiveRiskPage from '@/app/risk/executive/page';

// ── Helpers ────────────────────────────────────────────────────────────────────
function mockFetch(responses: Record<string, { ok: boolean; status?: number; body?: unknown }>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const match = Object.entries(responses).find(([k]) => url.includes(k));
    const cfg = match ? match[1] : { ok: false, status: 503 };
    const body = cfg.body ?? {};
    return {
      ok: cfg.ok,
      status: cfg.status ?? (cfg.ok ? 200 : 503),
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  });
}

// Full service-health response with all sub-fields the page reads.
const HEALTH_OK = {
  overallHealth: 'HEALTHY',
  connectorHealth: { healthy: 5, total: 5 },
  aiAvailability: 'AVAILABLE',
  actionSimulationHealth: 'HEALTHY',
  evidenceLedgerHealth: 'HEALTHY',
  anchorHealth: 'HEALTHY',
};

// ── Findings page (BUG-02) ─────────────────────────────────────────────────────
describe('BUG-02 — Findings page metric tiles', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows numeric counts when backend answers with populated data', async () => {
    const findingsList = [
      {
        id: 'f1', title: 'T1', severity: 'HIGH', status: 'OPEN', finding_type: 'VULN',
        source_system: 'scan', last_confirmed_at: new Date().toISOString(),
        assertion: { state: 'CURRENT', ageHours: 1, reason: '' },
        priorityIntegrity: { scored: true, computedOverUnknowns: false },
      },
    ];
    const summary = {
      metrics: { open: 1, staleAssertions: 0, ageingAssertions: 0, unscored: 0, scoredOverUnknowns: 0, unresolvedAsset: 0 },
    };

    vi.stubGlobal('fetch', mockFetch({
      'findings?limit=200': { ok: true, body: findingsList },
      'findings/summary': { ok: true, body: summary },
    }));

    render(<FindingsPage />);

    // waitFor retries the whole callback — waits until tiles show non-unknown values.
    await waitFor(() => {
      const tileValues = document.querySelectorAll('p.font-mono.text-xl');
      expect(tileValues.length).toBeGreaterThan(0);
      Array.from(tileValues).forEach((el) => {
        expect(el.textContent).not.toBe('unknown');
      });
    });
  });

  it('shows 0 for all tiles when backend answers OK with an empty estate', async () => {
    const summary = {
      metrics: { open: 0, staleAssertions: 0, ageingAssertions: 0, unscored: 0, scoredOverUnknowns: 0, unresolvedAsset: 0 },
    };

    vi.stubGlobal('fetch', mockFetch({
      'findings?limit=200': { ok: true, body: [] },
      'findings/summary': { ok: true, body: summary },
    }));

    render(<FindingsPage />);

    await waitFor(() => {
      const tileValues = document.querySelectorAll('p.font-mono.text-xl');
      expect(tileValues.length).toBeGreaterThan(0);
      // With the fix, source.ok=true + no data → 0, never "unknown".
      Array.from(tileValues).forEach((el) => {
        expect(el.textContent).not.toBe('unknown');
      });
    });
  });

  it('renders UNAVAILABLE state when both sources fail (no numeric tiles)', async () => {
    vi.stubGlobal('fetch', mockFetch({
      'findings?limit=200': { ok: false, status: 503 },
      'findings/summary': { ok: false, status: 503 },
    }));

    render(<FindingsPage />);

    // When all required sources fail, ContractSurface renders an UNAVAILABLE banner
    // rather than the metric tile grid.
    await waitFor(() => {
      expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument();
    });
  });

  it('reads tenant-id from localStorage when demoState session is stripped', async () => {
    const stored = JSON.stringify({
      tenant: { id: 'tenant-real-01' },
      session: { token: 'tok-real' },
    });
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k === 'zoikoshield_demo_state' ? stored : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    const capturedHeaders: Record<string, string>[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders.push((init?.headers ?? {}) as Record<string, string>);
      return {
        ok: true,
        status: 200,
        json: async () => ({ metrics: { open: 0 } }),
        text: async () => '{}',
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<FindingsPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    // At least one call should have carried x-tenant-id from localStorage.
    const sentTenantIds = capturedHeaders.flatMap((h) =>
      h['x-tenant-id'] ? [h['x-tenant-id']] : [],
    );
    expect(sentTenantIds.some((id) => id === 'tenant-real-01')).toBe(true);
  });
});

// ── Executive Risk page (BUG-03) ───────────────────────────────────────────────
describe('BUG-03 — Executive Risk page metric tiles', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows numeric counts when backend answers with populated security/assurance data', async () => {
    const security = {
      metrics: { openAlerts: 3, criticalAlerts: 1, openCases: 2, casesAwaitingCustomer: 0 },
      definition: 'Live SOC posture.',
    };
    const assurance = {
      metrics: {
        controlsEffective: 10, controlsPartiallyEffective: 2, controlsIneffective: 1,
        controlsUnknown: 0, evidenceGapsOpen: 0, expiredRiskAcceptances: 0, expiredExceptions: 0,
      },
      healthState: 'HEALTHY',
      definition: 'Assurance posture.',
    };

    vi.stubGlobal('fetch', mockFetch({
      'reporting/security': { ok: true, body: security },
      'reporting/assurance': { ok: true, body: assurance },
      'reporting/service-health': { ok: true, body: HEALTH_OK },
      '/api/v1/risks': { ok: true, body: [] },
      'reporting/snapshots': { ok: true, body: [] },
    }));

    render(<ExecutiveRiskPage />);

    await waitFor(() => {
      const tileValues = document.querySelectorAll('p.font-mono.text-2xl');
      expect(tileValues.length).toBeGreaterThan(0);
      // openAlerts = 3 must appear as a tile value.
      const texts = Array.from(tileValues).map((el) => el.textContent);
      expect(texts).toContain('3');
    });

    // Now all tiles should be non-unknown (sources answered OK).
    const tileValues = Array.from(document.querySelectorAll('p.font-mono.text-2xl'));
    tileValues.forEach((el) => {
      expect(el.textContent).not.toBe('unknown');
    });

  });

  it('shows 0 for Incidents/Controls tiles when backend answers OK with empty metrics', async () => {
    const security = {
      metrics: { openAlerts: 0, criticalAlerts: 0, openCases: 0, casesAwaitingCustomer: 0 },
      definition: 'Live SOC posture.',
    };
    const assurance = {
      metrics: {
        controlsEffective: 0, controlsPartiallyEffective: 0, controlsIneffective: 0,
        controlsUnknown: 0, evidenceGapsOpen: 0, expiredRiskAcceptances: 0, expiredExceptions: 0,
      },
      healthState: 'HEALTHY',
      definition: 'Assurance posture.',
    };

    vi.stubGlobal('fetch', mockFetch({
      'reporting/security': { ok: true, body: security },
      'reporting/assurance': { ok: true, body: assurance },
      'reporting/service-health': { ok: true, body: HEALTH_OK },
      '/api/v1/risks': { ok: true, body: [] },
      'reporting/snapshots': { ok: true, body: [] },
    }));

    render(<ExecutiveRiskPage />);

    await waitFor(() => {
      const tileValues = document.querySelectorAll('p.font-mono.text-2xl');
      expect(tileValues.length).toBeGreaterThan(0);
      // With the fix, source.ok=true + zero metrics → 0, never "unknown".
      Array.from(tileValues).forEach((el) => {
        expect(el.textContent).not.toBe('unknown');
      });
    });
  });

  it('renders UNAVAILABLE state when security and assurance sources fail (no numeric tiles)', async () => {
    vi.stubGlobal('fetch', mockFetch({
      'reporting/security': { ok: false, status: 503 },
      'reporting/assurance': { ok: false, status: 503 },
      'reporting/service-health': { ok: false, status: 503 },
      '/api/v1/risks': { ok: false, status: 503 },
      'reporting/snapshots': { ok: false, status: 503 },
    }));

    render(<ExecutiveRiskPage />);

    // When all required sources fail, ContractSurface renders an UNAVAILABLE banner.
    await waitFor(() => {
      expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument();
    });
  });
});
