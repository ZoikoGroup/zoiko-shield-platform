import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const get = vi.fn();
const post = vi.fn();
const patch = vi.fn();
vi.mock("@/lib/backend", () => ({
  backend: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    patch: (...a: unknown[]) => patch(...a),
  },
}));

import AlertRulesPanel, {
  conditionsForApi,
  describeRule,
  draftFromRule,
  emptyDraft,
  payloadFromDraft,
  problemWith,
} from "@/components/customer/AlertRulesPanel";

const rule = (over: object = {}) => ({
  id: "r1",
  name: "Push to payments",
  description: "",
  severity: "HIGH",
  enabled: true,
  conditions: [{ field: "resource_id", operator: "EQUALS", value: "acme/payments" }],
  threshold: null,
  windowMinutes: null,
  ...over,
});

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
});

describe("draft helpers", () => {
  const draft = (over: object = {}) => ({
    ...emptyDraft(),
    name: "My rule",
    conditions: [{ field: "outcome", operator: "EQUALS", value: " FAILURE " }],
    ...over,
  });

  it("turns IN values into a trimmed list and trims the rest", () => {
    expect(conditionsForApi(draft({ conditions: [{ field: "actor_user_id", operator: "IN", value: " alice, ,bob " }] }))).toEqual([
      { field: "actor_user_id", operator: "IN", value: ["alice", "bob"] },
    ]);
    expect(conditionsForApi(draft())[0].value).toBe("FAILURE");
  });

  it("explains what is wrong before anything is sent", () => {
    expect(problemWith(draft({ name: "ab" }))).toMatch(/name/);
    expect(problemWith(draft({ name: "ab" }), false)).toBeNull();
    expect(problemWith(draft({ conditions: [] }))).toMatch(/at least one condition/);
    expect(problemWith(draft({ conditions: [{ field: "outcome", operator: "EQUALS", value: "  " }] }))).toMatch(/value/);
    expect(problemWith(draft({ conditions: [{ field: "outcome", operator: "IN", value: " , " }] }))).toMatch(/value/);
    expect(problemWith(draft({ useThreshold: true, threshold: "1" }))).toMatch(/between 2 and 1000/);
    expect(problemWith(draft({ useThreshold: true, threshold: "3", windowMinutes: "0" }))).toMatch(/between 1 and 1440/);
    expect(problemWith(draft({ useThreshold: true, threshold: "3.5" }))).toMatch(/between 2 and 1000/);
    expect(problemWith(draft())).toBeNull();
  });

  it("sends the threshold only when it is switched on", () => {
    expect(payloadFromDraft(draft())).toEqual({
      name: "My rule",
      severity: "HIGH",
      conditions: [{ field: "outcome", operator: "EQUALS", value: "FAILURE" }],
    });
    expect(payloadFromDraft(draft({ useThreshold: true, threshold: "5", windowMinutes: "10" }))).toMatchObject({
      threshold: 5,
      windowMinutes: 10,
    });
  });

  it("round-trips a saved rule back into the form", () => {
    const d = draftFromRule(rule({ conditions: [{ field: "outcome", operator: "IN", value: ["a", "b"] }], threshold: 4, windowMinutes: 30 }) as any);
    expect(d).toMatchObject({ useThreshold: true, threshold: "4", windowMinutes: "30" });
    expect(d.conditions[0].value).toBe("a, b");
  });

  it("describes a rule in words", () => {
    expect(describeRule(rule() as any)).toBe("Every time Resource is acme/payments");
    expect(describeRule(rule({ threshold: 5, windowMinutes: 10 }) as any)).toMatch(/^5\+ times in 10 min when/);
  });
});

describe("AlertRulesPanel", () => {
  it("lists the workspace's rules with severity and plain-words conditions", async () => {
    get.mockResolvedValue({ data: [rule(), rule({ id: "r2", name: "Quiet one", enabled: false })] });
    render(<AlertRulesPanel />);
    expect(await screen.findByText("Push to payments")).toBeTruthy();
    expect(screen.getByText("Quiet one")).toBeTruthy();
    expect(screen.getAllByText("Every time Resource is acme/payments")).toHaveLength(2);
    expect(screen.getByText("Off")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/alert-rules");
  });

  it("invites the first rule when there are none", async () => {
    get.mockResolvedValue({ data: [] });
    render(<AlertRulesPanel />);
    expect(await screen.findByText(/have not created any alert rules/)).toBeTruthy();
  });

  it("says so, rather than showing an empty list, when loading fails", async () => {
    get.mockRejectedValue(new Error("boom"));
    render(<AlertRulesPanel />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/Could not load.*boom/);
  });

  it("turns a rule off", async () => {
    get.mockResolvedValue({ data: [rule()] });
    post.mockResolvedValue({});
    render(<AlertRulesPanel />);
    fireEvent.click(await screen.findByText("Turn off"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/alert-rules/r1/enabled", { enabled: false }));
  });

  it("creates a rule, after checking it, and reloads the list", async () => {
    get.mockResolvedValue({ data: [] });
    post.mockResolvedValue({});
    render(<AlertRulesPanel />);
    fireEvent.click(await screen.findByText("+ New alert rule"));

    fireEvent.click(screen.getByText("Create rule"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/name/);
    expect(post).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Rule name"), { target: { value: "Failed logins" } });
    fireEvent.change(screen.getByLabelText("Condition 1 value"), { target: { value: "GIT_PUSH" } });
    fireEvent.click(screen.getByText("Create rule"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/alert-rules", {
        name: "Failed logins",
        severity: "HIGH",
        conditions: [{ field: "event_activity", operator: "EQUALS", value: "GIT_PUSH" }],
      }),
    );
    expect(await screen.findByText(/Rule created/)).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("shows what the server refused", async () => {
    get.mockResolvedValue({ data: [] });
    post.mockRejectedValue(new Error("A tenant can have at most 100 rules."));
    render(<AlertRulesPanel />);
    fireEvent.click(await screen.findByText("+ New alert rule"));
    fireEvent.change(screen.getByLabelText("Rule name"), { target: { value: "Another" } });
    fireEvent.change(screen.getByLabelText("Condition 1 value"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("Create rule"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/at most 100 rules/);
  });

  it("tests a rule against recent events without saving it", async () => {
    get.mockResolvedValue({ data: [] });
    post.mockResolvedValue({
      data: { evaluated: 50, matched: 3, samples: [{ id: "e1", activity: "GIT_PUSH", resource: "acme/payments", actor: "alice", outcome: "SUCCESS" }] },
    });
    render(<AlertRulesPanel />);
    fireEvent.click(await screen.findByText("+ New alert rule"));
    fireEvent.change(screen.getByLabelText("Condition 1 value"), { target: { value: "GIT_PUSH" } });
    fireEvent.click(screen.getByText("Test against recent events"));

    expect((await screen.findByRole("status")).textContent).toMatch(/Would have matched 3 of your last 50 events/);
    expect(screen.getByText("GIT_PUSH · acme/payments · alice · SUCCESS")).toBeTruthy();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe("/api/v1/alert-rules/preview");

    // Editing the rule invalidates the result it showed.
    fireEvent.change(screen.getByLabelText("Condition 1 value"), { target: { value: "other" } });
    expect(screen.queryByText(/Would have matched/)).toBeNull();
  });

  it("is honest when nothing matches or nothing has arrived yet", async () => {
    get.mockResolvedValue({ data: [] });
    post.mockResolvedValueOnce({ data: { evaluated: 20, matched: 0, samples: [] } });
    render(<AlertRulesPanel />);
    fireEvent.click(await screen.findByText("+ New alert rule"));
    fireEvent.change(screen.getByLabelText("Condition 1 value"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("Test against recent events"));
    expect(await screen.findByText(/Nothing matched/)).toBeTruthy();

    post.mockResolvedValueOnce({ data: { evaluated: 0, matched: 0, samples: [] } });
    fireEvent.click(screen.getByText("Test against recent events"));
    expect(await screen.findByText(/nothing to test against/)).toBeTruthy();
  });

  it("edits an existing rule in place", async () => {
    get.mockResolvedValue({ data: [rule()] });
    patch.mockResolvedValue({});
    render(<AlertRulesPanel />);
    fireEvent.click(await screen.findByText("Edit"));
    fireEvent.change(screen.getByLabelText("Rule name"), { target: { value: "Renamed rule" } });
    fireEvent.click(screen.getByText("Save changes"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        "/api/v1/alert-rules/r1",
        expect.objectContaining({ name: "Renamed rule", conditions: [{ field: "resource_id", operator: "EQUALS", value: "acme/payments" }] }),
      ),
    );
  });
});
