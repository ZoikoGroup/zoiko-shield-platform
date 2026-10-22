"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Shield, Compass, ArrowRight, Home, CheckCircle2 } from "lucide-react";

export default function NotFound() {
  const pathname = usePathname();
  const router = useRouter();
  const [suggestion, setSuggestion] = useState<{ path: string; name: string } | null>(null);

  useEffect(() => {
    if (!pathname) return;
    const lower = pathname.toLowerCase();
    if (lower.includes("control")) {
      setSuggestion({ path: "/controls", name: "Continuous Compliance Controls (/controls)" });
    } else if (lower.includes("audit")) {
      setSuggestion({ path: "/audit", name: "Sealed Audit Package & Offline Verifier (/audit)" });
    } else if (lower.includes("case")) {
      setSuggestion({ path: "/cases", name: "Security Case Workspace (/cases)" });
    } else if (lower.includes("ledger")) {
      setSuggestion({ path: "/ledger", name: "Merkle Evidence Ledger (/ledger)" });
    } else if (lower.includes("notif")) {
      setSuggestion({ path: "/notifications", name: "Notification Center (/notifications)" });
    } else if (lower.includes("email") || lower.includes("template")) {
      setSuggestion({ path: "/admin/email-templates", name: "Email Template Studio (/admin/email-templates)" });
    } else if (lower.includes("jit")) {
      setSuggestion({ path: "/admin/jit-elevation", name: "JIT Elevation Cockpit (/admin/jit-elevation)" });
    } else if (lower.includes("pricing") || lower.includes("plan")) {
      setSuggestion({ path: "/pricing", name: "Commercial Plans & Band Sizing (/pricing)" });
    } else if (lower.includes("gtm")) {
      setSuggestion({ path: "/admin/gtm-checklist", name: "12-Item GTM Checklist (/admin/gtm-checklist)" });
    } else if (lower.includes("gate")) {
      setSuggestion({ path: "/admin/g1-gate", name: "G1 Launch Gate (/admin/g1-gate)" });
    } else if (lower.includes("health")) {
      setSuggestion({ path: "/admin/platform-health", name: "Platform Health & DR Drill (/admin/platform-health)" });
    }
  }, [pathname]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-6">
      <Card variant="cyber" className="max-w-lg w-full p-8 border-cyan-500/40 text-center space-y-6 shadow-[0_0_40px_rgba(6,182,212,0.15)]">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.25)]">
          <Shield className="w-7 h-7 text-cyan-400" />
        </div>

        <div>
          <span className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider">
            Route Resolution Gateway
          </span>
          <h1 className="text-2xl font-black text-slate-100 mt-1">
            Navigated to Non-Standard Route
          </h1>
          <p className="text-xs font-mono text-cyan-300/90 mt-2 break-all bg-canvas p-2.5 rounded-xl border border-line shadow-inner">
            {pathname}
          </p>
        </div>

        {suggestion && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/40 to-surface border border-cyan-500/40 text-left space-y-2.5 shadow-[0_0_15px_rgba(6,182,212,0.1)]">
            <div className="text-xs font-mono text-cyan-300 flex items-center gap-1.5 font-bold">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              Suggested Destination:
            </div>
            <p className="text-xs text-slate-300">{suggestion.name}</p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => router.push(suggestion.path)}
              className="w-full text-xs flex items-center justify-center gap-1.5 mt-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold shadow-[0_0_15px_rgba(6,182,212,0.3)]"
            >
              <span>Go to {suggestion.path}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        <div className="pt-3 border-t border-line flex flex-wrap items-center justify-center gap-2">
          <Link href="/controls">
            <Button variant="outline" size="sm" className="text-xs border-line bg-canvas hover:border-cyan-500/40 hover:text-cyan-300">
              Controls
            </Button>
          </Link>
          <Link href="/audit">
            <Button variant="outline" size="sm" className="text-xs border-line bg-canvas hover:border-cyan-500/40 hover:text-cyan-300">
              Audit
            </Button>
          </Link>
          <Link href="/cases">
            <Button variant="outline" size="sm" className="text-xs border-line bg-canvas hover:border-cyan-500/40 hover:text-cyan-300">
              Cases
            </Button>
          </Link>
          <Link href="/ledger">
            <Button variant="outline" size="sm" className="text-xs border-line bg-canvas hover:border-cyan-500/40 hover:text-cyan-300">
              Ledger
            </Button>
          </Link>
          <Link href="/notifications">
            <Button variant="outline" size="sm" className="text-xs border-line bg-canvas hover:border-cyan-500/40 hover:text-cyan-300">
              Notifications
            </Button>
          </Link>
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-xs flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
              <Home className="w-3.5 h-3.5" />
              <span>Command Center</span>
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
