import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const get = vi.fn();
vi.mock("@/lib/backend", () => ({ backend: { get: (...a: unknown[]) => get(...a) } }));

import ConnectorActivityPanel, { humanizeActivity } from "@/components/customer/ConnectorActivityPanel";

const ID = "f0bd634f-c3d4-4187-b46a-dd1b3e7cfc7d";
const PATH = `/api/v1/connectors/${ID}/activity?limit=10`;
const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString();

const push = (over: object = {}) => ({
  id: "r1",
  receivedAt: iso(5),
  status: "NORMALIZED",
  activity: "GIT_PUSH",
  category: "SOURCE_CONTROL",
  severity: "INFORMATIONAL",
  outcome: "SUCCESS",
  actor: "vishwajeet208",
  resource: "vishwajeet208/testing-repo",
  resourceType: "GIT_REPOSITORY",
  details: { branch: "main", commits: 1, message: "Update README.md" },
  ...over,
});
/** The summary line as one string: the numbers are bold, so they sit in their own elements. */
const summary = () => screen.getByText(/in the last 24 hours/).parentElement!.textContent!;
const activity = (over: object = {}) => ({ total: 3, last24h: 2, lastReceivedAt: iso(5), events: [push()], ...over });

beforeEach(() => {
  cleanup();
  get.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

describe("humanizeActivity", () => {
  it("turns machine names into words", () => {
    expect(humanizeActivity("GIT_PUSH")).toBe("Git push");
    expect(humanizeActivity("auth.failed_login")).toBe("Auth failed login");
    expect(humanizeActivity(null)).toBe("Event");
    expect(humanizeActivity("")).toBe("Event");
  });
});

describe("ConnectorActivityPanel: what is shown", () => {
  it("shows the counts, when the last delivery arrived, and each delivery in words", async () => {
    get.mockResolvedValue(activity());
    render(<ConnectorActivityPanel connectorId={ID} />);

    expect(await screen.findByText("Git push")).toBeTruthy();
    expect(get).toHaveBeenCalledWith(PATH);
    expect(summary()).toContain("3 deliveries");
    expect(summary()).toContain("2 in the last 24 hours");
    expect(summary()).toContain("last 5 min ago");
    expect(screen.getByText(/vishwajeet208\/testing-repo · by vishwajeet208 · success/)).toBeTruthy();
    expect(screen.getByText(/branch main · 1 commit · “Update README.md”/)).toBeTruthy();
    expect(screen.getByText("Processed")).toBeTruthy();
  });

  it("says what each status means, and uses a plural for several commits", async () => {
    get.mockResolvedValue(
      activity({
        events: [
          push({ id: "a", status: "QUARANTINED", details: null }),
          push({ id: "b", status: "ACCEPTED", details: { commits: 3 } }),
        ],
      }),
    );
    render(<ConnectorActivityPanel connectorId={ID} />);
    await screen.findAllByText("Git push");
    expect(screen.getByText("Rejected").getAttribute("title")).toMatch(/set aside/);
    expect(screen.getByText("Received").getAttribute("title")).toMatch(/not processed yet/);
    expect(screen.getByText(/3 commits/)).toBeTruthy();
  });

  it("explains a delivery from which nothing could be extracted", async () => {
    get.mockResolvedValue(activity({ events: [push({ activity: null, resource: null, actor: null, outcome: null, details: null, status: "QUARANTINED" })] }));
    render(<ConnectorActivityPanel connectorId={ID} />);
    expect(await screen.findByText("Event")).toBeTruthy();
    expect(screen.getByText("No details were extracted from this delivery.")).toBeTruthy();
  });

  it("shows a helpful empty state when nothing has arrived", async () => {
    get.mockResolvedValue({ total: 0, last24h: 0, lastReceivedAt: null, events: [] });
    render(<ConnectorActivityPanel connectorId={ID} />);
    expect(await screen.findByText(/No deliveries yet/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Recent deliveries" })).toBeNull();
    expect(summary()).toContain("0 deliveries");
  });

  it("shows loading first, and the reason if it cannot load", async () => {
    let fail!: (e: Error) => void;
    get.mockReturnValue(new Promise((_, reject) => (fail = reject)));
    render(<ConnectorActivityPanel connectorId={ID} />);
    expect(screen.getByText("Loading activity…")).toBeTruthy();
    await act(async () => fail(new Error("The requested operation is not authorized")));
    expect((await screen.findByText(/Activity unavailable/)).textContent).toContain("not authorized");
  });

  it("never invents numbers from an unexpected answer", async () => {
    get.mockResolvedValue({ configured: false });
    render(<ConnectorActivityPanel connectorId={ID} />);
    expect(await screen.findByText(/Unexpected answer/)).toBeTruthy();
    expect(screen.queryByText(/in the last 24 hours/)).toBeNull();
  });

  it("escapes anything a sender put in a value (rendered as text, never as markup)", async () => {
    get.mockResolvedValue(activity({ events: [push({ resource: "<img src=x onerror=alert(1)>", details: { message: "<script>alert(1)</script>" } })] }));
    const { container } = render(<ConnectorActivityPanel connectorId={ID} />);
    await screen.findByText("Git push");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });
});

describe("ConnectorActivityPanel: staying current", () => {
  it("refreshes on demand", async () => {
    get.mockResolvedValueOnce(activity({ total: 3 })).mockResolvedValueOnce(activity({ total: 4 }));
    render(<ConnectorActivityPanel connectorId={ID} />);
    await waitFor(() => expect(summary()).toContain("3 deliveries"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(summary()).toContain("4 deliveries"));
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("looks again every 20 seconds while the tab is visible", async () => {
    vi.useFakeTimers();
    get.mockResolvedValue(activity());
    render(<ConnectorActivityPanel connectorId={ID} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(get).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(get).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("does not poll while the tab is hidden", async () => {
    vi.useFakeTimers();
    get.mockResolvedValue(activity());
    render(<ConnectorActivityPanel connectorId={ID} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("stops polling when it is closed", async () => {
    vi.useFakeTimers();
    get.mockResolvedValue(activity());
    const { unmount } = render(<ConnectorActivityPanel connectorId={ID} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("keeps showing the last result, with a notice, if a later refresh fails", async () => {
    get.mockResolvedValueOnce(activity()).mockRejectedValueOnce(new Error("503"));
    render(<ConnectorActivityPanel connectorId={ID} />);
    await screen.findByText("Git push");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText(/Could not refresh \(503\)/)).toBeTruthy();
    expect(screen.getByText("Git push")).toBeTruthy();
  });

  it("never shows one connector's activity under another, and ignores a late answer for the old one", async () => {
    let releaseOld!: (v: unknown) => void;
    get.mockImplementationOnce(() => new Promise((resolve) => (releaseOld = resolve)));
    get.mockResolvedValueOnce(activity({ total: 99, events: [push({ id: "new", activity: "GIT_TAG" })] }));
    const { rerender } = render(<ConnectorActivityPanel connectorId="old-connector" />);
    rerender(<ConnectorActivityPanel connectorId="new-connector" />);
    expect(await screen.findByText("Git tag")).toBeTruthy();

    await act(async () => releaseOld(activity({ total: 1, events: [push({ id: "stale", activity: "STALE_EVENT" })] })));
    expect(screen.queryByText("Stale event")).toBeNull();
    expect(summary()).toContain("99 deliveries");
  });
});
