"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import {
  EmailErrorNotice,
  EmailLoadingNotice,
  EmailNotice,
  EmailTime,
  EmailWorkspaceHeader,
  classifyEmailError,
  type ClassifiedEmailError,
} from "@/components/email/EmailSecurityUi";

export default function EmailPoliciesPage() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [policyKey, setPolicyKey] = useState("phishing-bec-severity-v1");
  const [name, setName] = useState("Default Email Severity & Escalation Policy");
  const [rationale, setRationale] = useState(
    "Align Microsoft 365 and Google Workspace high-severity BEC alerts to CRITICAL queue.",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ClassifiedEmailError | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPolicies = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const list = await ZoikoShieldApiClient.listEmailPolicies();
      setPolicies(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(classifyEmailError(err, "Failed to load email policies."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPolicies();
  }, [loadPolicies]);

  const handleDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await ZoikoShieldApiClient.draftEmailPolicy({
        policyKey,
        name,
        providerCoverage: ["MICROSOFT_365", "GOOGLE_WORKSPACE"],
        inputSources: ["defender_alerts_v2", "google_alert_center"],
        severityMapping: { phish: "HIGH", bec: "CRITICAL" },
        rationale,
      });
      setMessage("Draft policy version created. Requires an independent second approver (E10).");
      await loadPolicies();
    } catch (err) {
      setError(classifyEmailError(err, "Failed to create draft policy."));
    }
  };

  const runLifecycleAction = async (
    id: string,
    action: "approve" | "activate" | "rollback",
  ) => {
    setError(null);
    setMessage(null);
    try {
      if (action === "approve") await ZoikoShieldApiClient.approveEmailPolicy(id);
      if (action === "activate") await ZoikoShieldApiClient.activateEmailPolicy(id);
      if (action === "rollback") await ZoikoShieldApiClient.rollbackEmailPolicy(id);
      setMessage(
        action === "approve"
          ? `Policy ${id} approved by an independent reviewer.`
          : action === "activate"
            ? `Policy ${id} activated as a new immutable version.`
            : `Rollback recorded for policy ${id}; historical verdicts keep their original policy version.`,
      );
      await loadPolicies();
    } catch (err) {
      setError(classifyEmailError(err, `Failed to ${action} policy.`));
    }
  };

  return (
    <div className="space-y-6">
      <EmailWorkspaceHeader
        title="Email Detection & Governance Policies"
        subtitle="Versioned email classification and escalation policies with mandatory dual-control approval (self-approval blocked — E10)."
        activeHref="/email/policies"
      />

      {message && <EmailNotice tone="success">{message}</EmailNotice>}
      <EmailErrorNotice error={error} onRetry={error?.kind === "DENIED" ? undefined : loadPolicies} />

      <form
        onSubmit={handleDraft}
        className="p-5 rounded-xl bg-raised border border-line grid grid-cols-1 md:grid-cols-3 gap-3 items-end text-xs"
      >
        <label className="space-y-1 block">
          <span className="font-mono text-slate-400">Policy Key</span>
          <input
            type="text"
            required
            value={policyKey}
            onChange={(e) => setPolicyKey(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100 font-mono"
          />
        </label>
        <label className="space-y-1 block">
          <span className="font-mono text-slate-400">Policy Name</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
          />
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            required
            aria-label="Policy rationale"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
          />
          <Button type="submit" variant="cyan">
            Create Draft
          </Button>
        </div>
      </form>

      {loading && policies.length === 0 && !error && (
        <EmailLoadingNotice label="Loading policy versions…" />
      )}
      {!loading && policies.length === 0 && !error && (
        <EmailNotice tone="info">
          No detection policy versions exist yet. Findings are evaluated against provider verdicts
          only until a policy is approved and activated.
        </EmailNotice>
      )}

      <div className="space-y-3 text-xs">
        {policies.map((p) => (
          <div
            key={p.id}
            className="p-5 rounded-xl bg-raised border border-line flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="space-y-1">
              <div className="font-bold text-slate-100">
                {p.name}{" "}
                <span className="font-mono text-cyan-300">
                  ({p.policy_key} v{p.version})
                </span>
              </div>
              <div className="text-slate-400">{p.rationale}</div>
              <div className="font-mono text-[11px] text-slate-400">
                Status: {p.status} · Author: {p.authored_by} · Approver:{" "}
                {p.approved_by || "Pending independent reviewer"}
                {p.effective_from ? (
                  <>
                    {" "}
                    · Effective from <EmailTime iso={p.effective_from} />
                  </>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {p.status === "DRAFT" && (
                <Button
                  variant="secondary"
                  onClick={() => runLifecycleAction(p.id, "approve")}
                >
                  Approve (Non-Self)
                </Button>
              )}
              {p.status === "APPROVED" && (
                <Button
                  variant="cyan"
                  onClick={() => runLifecycleAction(p.id, "activate")}
                >
                  Activate
                </Button>
              )}
              {p.status === "ACTIVE" && (
                <Button
                  variant="secondary"
                  onClick={() => runLifecycleAction(p.id, "rollback")}
                >
                  Rollback
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
