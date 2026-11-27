import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/backend", async () => {
  const actual = await vi.importActual<typeof import("@/lib/backend")>("@/lib/backend");
  return { ...actual, backend: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a), delete: vi.fn(), patch: vi.fn() } };
});

import { CustomerIntegrationsSection } from "@/components/customer/CustomerWorkspaceViewsPart2";

const HOOK = "53a1d1e1-8149-47a9-bf19-249ef5c3b918";
const OKTA = "11111111-2222-3333-4444-555555555555";
const connectors = [
  { id: HOOK, name: "github-hook", state: "DEGRADED", authentication_type: "WEBHOOK_SECRET", source_region: "us-east-1", createdAt: "2026-11-26T00:00:00Z", definition: { provider: "generic-webhook" } },
  { id: OKTA, name: "okta-prod", state: "CONNECTED", authentication_type: "OAUTH", source_region: "us-east-1", createdAt: "2026-11-25T00:00:00Z", definition: { provider: "okta" } },
];
const health = { state: "DEGRADED", lastMessage: null, permissionStatus: "OK", credentialStatus: "UNKNOWN", lastSuccessfulConnectionAt: null, lastSuccessfulSyncAt: null, consecutiveFailures: 0 };

beforeEach(() => {
  cleanup();
  get.mockReset();
  post.mockReset();
  get.mockImplementation(async (path: string) => {
    const p = String(path);
    if (p.startsWith("/api/dev/tunnel")) throw new Error("not available");
    if (p === "/api/v1/connectors") return connectors;
    if (p === "/api/v1/connector-types") return [];
    if (p.endsWith("/health")) return health;
    if (p.endsWith("/webhook-secret")) return { configured: false };
    return [];
  });
});

describe("Integrations panel: webhook connectors are push-based", () => {
  it("does not offer Sync now for a webhook connector (there is nothing to pull)", async () => {
    render(<CustomerIntegrationsSection />);
    await screen.findByText(/Selected integration • github-hook/);
    expect(screen.getByRole("button", { name: "Test connection" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sync now" })).toBeNull();
  });

  it("still offers Sync now for a pull-style connector", async () => {
    render(<CustomerIntegrationsSection />);
    await screen.findByText(/Selected integration • github-hook/);
    fireEvent.click(screen.getAllByText("okta-prod")[0]);
    await screen.findByText(/Selected integration • okta-prod/);
    expect(screen.getByRole("button", { name: "Sync now" })).toBeTruthy();
  });

  it("shows WHY a test is unverified, not just the word", async () => {
    post.mockResolvedValue({ status: "UNVERIFIED", reason: "No signed delivery has been received yet. Send one (GitHub: open the webhook and choose Redeliver), then test again." });
    render(<CustomerIntegrationsSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Test connection" }));
    const notice = await screen.findByText(/No signed delivery has been received yet/);
    expect(notice.textContent).toContain('Connection test for "github-hook": Unverified.');
    expect(post.mock.calls[0][0]).toBe(`/api/v1/connectors/${HOOK}/test`);
  });

  it("keeps the short message when the test gives no reason", async () => {
    post.mockResolvedValue({ status: "HEALTHY" });
    render(<CustomerIntegrationsSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Test connection" }));
    await waitFor(() => expect(screen.getByText('Connection test for "github-hook": Healthy.')).toBeTruthy());
  });
});
