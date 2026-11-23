"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ShieldCheck, ArrowRight, FileText } from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";

export default function PricingSuccessPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session_id");
    if (!sid) return;
    setSessionId(sid);
    ZoikoShieldApiClient.getCheckoutSessionStatus(sid)
      .then((res) => setSessionStatus(res))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Unable to verify session status."),
      );
  }, []);

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 space-y-6">
      <div className="rounded-2xl bg-raised border border-emerald-500/40 p-6 md:p-8 space-y-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-7 h-7 text-emerald-400 shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-slate-100">
              Checkout Return Recorded
            </h1>
            <p className="text-xs font-mono text-emerald-300">
              Subscription fulfillment awaits backend webhook verification
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-line text-xs text-slate-300 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-cyan-300">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Commercial Governance Notice (Invariant C02 / ADR-06)</span>
          </div>
          <p className="leading-relaxed text-slate-400">
            Final entitlements, pricing schedules, and contractual commitments are NOT APPROVED from checkout return state alone and require backend session verification plus commercial manager confirmation on an executed Order Form.
          </p>
        </div>

        {sessionId && (
          <div className="p-4 rounded-xl bg-canvas border border-line text-xs font-mono space-y-1">
            <div className="text-slate-400">
              Checkout Session: <span className="text-slate-200">{sessionId}</span>
            </div>
            {sessionStatus?.status && (
              <div className="text-emerald-300">
                Verified Status: {String(sessionStatus.status)}
              </div>
            )}
            {error && <div className="text-amber-300">{error}</div>}
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold"
          >
            <span>Return to Commercial Plans</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/services"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface border border-line hover:border-cyan-500/40 text-slate-200 text-xs font-medium"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span>View Service Catalogue</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
