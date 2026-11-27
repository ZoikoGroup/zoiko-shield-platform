import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const get = vi.fn();
vi.mock("@/lib/backend", () => ({ backend: { get: (...a: unknown[]) => get(...a) } }));

import { hoursForWindow, useEventCount } from "@/lib/use-event-count";

beforeEach(() => {
  get.mockReset(); // braces matter: a returned function would be run as a teardown
});

describe("hoursForWindow", () => {
  it("maps the dashboard's windows to hours, and anything else to the default", () => {
    expect(hoursForWindow("Last 24 hours")).toBe(24);
    expect(hoursForWindow("Last 7 days")).toBe(168);
    expect(hoursForWindow("Last 30 days")).toBe(24);
    expect(hoursForWindow("")).toBe(24);
  });
});

describe("useEventCount", () => {
  it("is not known (null) until the real number arrives, then shows it", async () => {
    get.mockResolvedValue({ receivedInWindow: 7, windowHours: 24 });
    const { result } = renderHook(() => useEventCount("Last 24 hours"));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(7));
    expect(get).toHaveBeenCalledWith("/api/v1/dashboard/events?hours=24");
  });

  it("reports a real zero as 0, which is different from not knowing", async () => {
    get.mockResolvedValue({ receivedInWindow: 0 });
    const { result } = renderHook(() => useEventCount("Last 24 hours"));
    await waitFor(() => expect(result.current).toBe(0));
  });

  it("stays null (a dash, never a zero) when the request fails", async () => {
    get.mockRejectedValue(new Error("403"));
    const { result } = renderHook(() => useEventCount("Last 24 hours"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBeNull();
  });

  it("ignores an answer that is not a count", async () => {
    get.mockResolvedValue({ configured: false });
    const { result } = renderHook(() => useEventCount("Last 24 hours"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBeNull();
  });

  it("asks for the new window when it changes, and shows not-known in between", async () => {
    get.mockImplementation(async (path: string) => ({ receivedInWindow: path.includes("hours=168") ? 40 : 7 }));
    const { result, rerender } = renderHook(({ w }) => useEventCount(w), { initialProps: { w: "Last 24 hours" } });
    await waitFor(() => expect(result.current).toBe(7));
    rerender({ w: "Last 7 days" });
    await waitFor(() => expect(result.current).toBe(40));
    expect(get).toHaveBeenLastCalledWith("/api/v1/dashboard/events?hours=168");
  });

  it("never lets a slow, older answer overwrite a newer one", async () => {
    let releaseOld!: (v: unknown) => void;
    get.mockImplementationOnce(() => new Promise((r) => (releaseOld = r))); // 24h: slow
    get.mockResolvedValueOnce({ receivedInWindow: 40 }); // 7d: fast
    const { result, rerender } = renderHook(({ w }) => useEventCount(w), { initialProps: { w: "Last 24 hours" } });
    rerender({ w: "Last 7 days" });
    await waitFor(() => expect(result.current).toBe(40));
    releaseOld({ receivedInWindow: 7 }); // arrives late
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(40);
  });

  it("asks again when refreshed", async () => {
    get.mockResolvedValueOnce({ receivedInWindow: 1 }).mockResolvedValueOnce({ receivedInWindow: 2 });
    const { result, rerender } = renderHook(({ k }) => useEventCount("Last 24 hours", true, k), { initialProps: { k: 0 } });
    await waitFor(() => expect(result.current).toBe(1));
    rerender({ k: 1 });
    await waitFor(() => expect(result.current).toBe(2));
  });

  it("makes no request and stays null when disabled (tests, or a view that does not want it)", async () => {
    const { result } = renderHook(() => useEventCount("Last 24 hours", false));
    await act(async () => {
      await Promise.resolve();
    });
    expect(get).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });
});
