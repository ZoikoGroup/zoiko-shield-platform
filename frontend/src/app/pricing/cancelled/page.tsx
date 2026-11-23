"use client";

import React from "react";
import Link from "next/link";
import { XCircle, ShieldCheck, ArrowRight } from "lucide-react";

export default function PricingCancelledPage() {
  return (
    <div className="max-w-3xl mx-auto py-12 px-4 space-y-6">
      <div className="rounded-2xl bg-raised border border-amber-500/40 p-6 md:p-8 space-y-4">
        <div className="flex items-center gap-3">
          <XCircle className="w-7 h-7 text-amber-400 shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-slate-100">
              Checkout Cancelled — No Charges Applied
            </h1>
            <p className="text-xs font-mono text-amber-300">
              No subscription changes or billing obligations were created
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-line text-xs text-slate-300 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-cyan-300">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Commercial Governance Notice (Invariant C02 / ADR-06)</span>
          </div>
          <p className="leading-relaxed text-slate-400">
            Commercial tier pricing, SOW scope, and custom allocations are NOT APPROVED without explicit commercial manager confirmation and an executed Order Form.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold"
          >
            <span>Return to Plans &amp; Sizing</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/team"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface border border-line hover:border-cyan-500/40 text-slate-200 text-xs font-medium"
          >
            <span>Request Manager Quote</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
