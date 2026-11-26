import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/backend", () => ({ backend: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } }));

import WebhookUrlCard, { webhookUrlFor } from "@/components/customer/WebhookUrlCard";

const ID = "53a1d1e1-8149-47a9-bf19-249ef5c3b918";
const SECRET = "whsec_abcdefghijklmnopqrstuvwxyz0123456789ABCD";

const unconfigured = { configured: false };
const configured = (over: object = {}) => ({
  configured: true,
  version: 1,
  hint: "ABCD",
  createdAt: "2026-11-26T14:00:00.000Z",
  revealed: false,
  previousValidUntil: null,
  ...over,
});

beforeEach(() => {
  cleanup();
  get.mockReset();
  post.mockReset();
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("webhookUrlFor", () => {
  it("builds the ingest URL and ignores trailing slashes on the base", () => {
    expect(webhookUrlFor(ID, "https://api.example.com/")).toBe(
      `https://api.example.com/api/v1/ingestion/webhooks/${ID}`
    );
  });
  it("defaults to the local API outside production", () => {
    expect(webhookUrlFor(ID, undefined, false)).toBe(`http://localhost:3001/api/v1/ingestion/webhooks/${ID}`);
  });
  it("gives no URL in production when no public address is configured", () => {
    expect(webhookUrlFor(ID, undefined, true)).toBeNull();
    expect(webhookUrlFor(ID, "https://api.example.com", true)).toBe(`https://api.example.com/api/v1/ingestion/webhooks/${ID}`);
  });
});

describe("WebhookUrlCard — URL", () => {
  it("shows the URL and copies it", async () => {
    get.mockResolvedValue(unconfigured);
    render(<WebhookUrlCard connectorId={ID} />);
    const field = screen.getByLabelText("Webhook URL") as HTMLInputElement;
    expect(field.value).toContain(`/api/v1/ingestion/webhooks/${ID}`);
    fireEvent.click(screen.getAllByRole("button", { name: "Copy" })[0]);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(field.value));
  });
});

describe("WebhookUrlCard — signing secret", () => {
  it("shows which secret is active without revealing it", async () => {
    get.mockResolvedValue(configured());
    const { container } = render(<WebhookUrlCard connectorId={ID} />);
    await screen.findByText(/whsec_••••ABCD/);
    expect(container.textContent).toContain("version 1");
    expect(container.textContent).not.toContain(SECRET);
    expect(screen.getByRole("button", { name: /Reveal secret/ })).toBeTruthy();
  });

  it("reveals the secret once, then discards it when done", async () => {
    get.mockResolvedValueOnce(configured()).mockResolvedValue(configured({ revealed: true }));
    post.mockResolvedValue({ secret: SECRET, version: 1 });
    const { container } = render(<WebhookUrlCard connectorId={ID} />);
    fireEvent.click(await screen.findByRole("button", { name: /Reveal secret/ }));

    const field = (await screen.findByLabelText("Signing secret")) as HTMLInputElement;
    expect(field.value).toBe(SECRET);
    expect(post).toHaveBeenCalledWith(
      `/api/v1/connectors/${ID}/webhook-secret/reveal`,
      undefined,
      { confirmed: true }
    );
    expect(screen.getByRole("alert").textContent).toContain("will not be shown again");

    fireEvent.click(screen.getByRole("button", { name: /Done/ }));
    await waitFor(() => expect(container.textContent).not.toContain(SECRET));
    expect(screen.queryByRole("button", { name: /Reveal secret/ })).toBeNull();
  });

  it("offers no reveal once the secret has been shown", async () => {
    get.mockResolvedValue(configured({ revealed: true }));
    render(<WebhookUrlCard connectorId={ID} />);
    await screen.findByText(/whsec_••••ABCD/);
    expect(screen.queryByRole("button", { name: /Reveal secret/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Rotate secret" })).toBeTruthy();
  });

  it("explains a 409 instead of failing silently", async () => {
    get.mockResolvedValue(configured());
    post.mockRejectedValue(new Error("This secret has already been shown. Rotate it to get a new one."));
    render(<WebhookUrlCard connectorId={ID} />);
    fireEvent.click(await screen.findByRole("button", { name: /Reveal secret/ }));
    expect((await screen.findByText(/already been shown/)).textContent).toContain("Rotate");
  });

  it("asks before rotating and sends the immediate option", async () => {
    get.mockResolvedValue(configured({ revealed: true }));
    post.mockResolvedValue({ secret: SECRET, version: 2, previousValidUntil: "2999-01-01T00:00:00.000Z" });
    render(<WebhookUrlCard connectorId={ID} />);
    fireEvent.click(await screen.findByRole("button", { name: "Rotate secret" }));
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Rotate now" }));

    expect(((await screen.findByLabelText("Signing secret")) as HTMLInputElement).value).toBe(SECRET);
    expect(post).toHaveBeenCalledWith(
      `/api/v1/connectors/${ID}/webhook-secret/rotate`,
      { immediate: true },
      { confirmed: true }
    );
    expect(screen.getByRole("alert").textContent).toContain("previous secret keeps working");
  });

  it("can be cancelled without rotating", async () => {
    get.mockResolvedValue(configured({ revealed: true }));
    render(<WebhookUrlCard connectorId={ID} />);
    fireEvent.click(await screen.findByRole("button", { name: "Rotate secret" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Rotate secret" })).toBeTruthy();
  });

  it("offers to generate one for a connector that has none", async () => {
    get.mockResolvedValue(unconfigured);
    post.mockResolvedValue({ secret: SECRET, version: 1 });
    render(<WebhookUrlCard connectorId={ID} />);
    fireEvent.click(await screen.findByRole("button", { name: "Generate secret" }));
    expect(((await screen.findByLabelText("Signing secret")) as HTMLInputElement).value).toBe(SECRET);
    expect(post.mock.calls[0][0]).toBe(`/api/v1/connectors/${ID}/webhook-secret/rotate`);
  });

  it("never carries one connector's secret over to another", async () => {
    get.mockResolvedValue(configured());
    post.mockResolvedValue({ secret: SECRET, version: 1 });
    const { rerender, container } = render(<WebhookUrlCard connectorId={ID} />);
    fireEvent.click(await screen.findByRole("button", { name: /Reveal secret/ }));
    await screen.findByLabelText("Signing secret");
    rerender(<WebhookUrlCard connectorId="another-connector" />);
    await waitFor(() => expect(container.textContent).not.toContain(SECRET));
  });

  it("says so when the status cannot be loaded", async () => {
    get.mockRejectedValue(new Error("The requested operation is not authorized"));
    render(<WebhookUrlCard connectorId={ID} />);
    expect((await screen.findByText(/Signing secret unavailable/)).textContent).toContain("not authorized");
  });
});
