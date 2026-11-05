import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CustomerTopHeader } from '@/components/customer/CustomerTopHeader';

vi.mock('next/navigation', () => ({
  usePathname: () => '/customer/dashboard',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const ME = { id: 'p1', email: 'owner@acme.test', fullName: 'Olivia Owner', tenantId: 't1', environmentId: 'e1', region: 'eu-west-1' };
const TENANT = { id: 't1', name: 'Acme Test Org', slug: 'acme', status: 'ACTIVE', homeRegion: 'eu-west-1', dataResidencyRegion: 'eu-west-1', timezone: 'UTC', dataClass: 'STANDARD', retentionPolicyRef: 'default', createdAt: '', updatedAt: '' };
const MEMBERS = [{ principalId: 'p1', roles: [{ code: 'TENANT_OWNER', name: 'Tenant Owner' }] }];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('CustomerTopHeader', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the signed-in identity, organisation, role and residency from the backend', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/auth/me')) return json(ME);
      if (url.includes('/members')) return json(MEMBERS);
      if (url.includes('/tenants/t1')) return json(TENANT);
      if (url.includes('/notifications')) return json([]);
      return json({}, 404);
    });
    render(<CustomerTopHeader />);

    expect(await screen.findByText('Olivia Owner')).toBeInTheDocument();
    expect(screen.getByText('Acme Test Org')).toBeInTheDocument();
    expect(screen.getByText('Tenant Owner')).toBeInTheDocument();
    expect(screen.getByText('EU (Ireland)')).toBeInTheDocument();
    for (const fake of ['Jane Doe', 'Acme Global Ltd', 'CISO', 'Production', 'Authenticated User', 'Organization Workspace']) {
      expect(screen.queryByText(fake)).not.toBeInTheDocument();
    }
  });

  it('lists real notifications and acknowledges each unread one on "Mark all as read"', async () => {
    const acked: string[] = [];
    let rows = [
      { id: 'n1', event_id: 'case.created', channel: 'EMAIL', status: 'DELIVERED', created_at: '2026-11-05T10:00:00Z' },
      { id: 'n2', event_id: 'alert.raised', channel: 'IN_APP', status: 'ACKNOWLEDGED', created_at: '2026-11-05T09:00:00Z' },
    ];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const ack = url.match(/notifications\/([^/]+)\/acknowledge/);
      if (ack) {
        expect(JSON.parse(String(init?.body))).toEqual({ acknowledgementType: 'SEEN' });
        acked.push(ack[1]);
        rows = rows.map((r) => (r.id === ack[1] ? { ...r, status: 'ACKNOWLEDGED' } : r));
        return json({ id: 'ack-1' });
      }
      if (url.includes('/notifications')) return json(rows);
      if (url.includes('/auth/me')) return json(ME);
      if (url.includes('/members')) return json(MEMBERS);
      if (url.includes('/tenants/t1')) return json(TENANT);
      return json({}, 404);
    });
    render(<CustomerTopHeader />);

    fireEvent.click(await screen.findByLabelText('Notifications'));
    expect(await screen.findByText('case.created')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument(); // one unread

    fireEvent.click(screen.getByText('Mark all as read'));
    await waitFor(() => expect(acked).toEqual(['n1']));
    await waitFor(() => expect(screen.queryByText('1')).not.toBeInTheDocument());
  });

  it('shows the backend error when notifications cannot be loaded', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/notifications')) return json({ message: 'notification store unavailable' }, 503);
      if (url.includes('/auth/me')) return json(ME);
      if (url.includes('/members')) return json(MEMBERS);
      if (url.includes('/tenants/t1')) return json(TENANT);
      return json({}, 404);
    });
    render(<CustomerTopHeader />);

    fireEvent.click(await screen.findByLabelText('Notifications'));
    expect(await screen.findByText('notification store unavailable')).toBeInTheDocument();
  });
});
