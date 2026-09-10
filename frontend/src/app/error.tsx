"use client";

import React, { useEffect } from "react";
import { resetDemoState } from "@/lib/demo-state";
import { AlertOctagon, RotateCcw, Home } from "lucide-react";
import Link from "next/link";

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    if ("message" in error && typeof (error as any).message === "string") {
      return (error as any).message;
    }
    if ("type" in error && typeof (error as any).type === "string") {
      return `Platform Runtime Event (${(error as any).type})`;
    }
    try {
      const serialized = JSON.stringify(error);
      if (serialized !== "{}") return serialized;
    } catch {
      // Ignore serialization failure
    }
  }
  return "An unexpected platform runtime state occurred.";
}

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log sanitized error details
    console.error("ZoikoShield Error Boundary Caught:", error);
  }, [error]);

  const errorMessage = formatErrorMessage(error);

  const handleResetStateAndRetry = () => {
    try {
      resetDemoState();
    } catch {
      // Ignore
    }
    reset();
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#11141c] border border-rose-500/40 rounded-2xl p-6 shadow-[0_0_50px_rgba(244,63,94,0.15)] text-center space-y-5">
        <div className="w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mx-auto text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.3)]">
          <AlertOctagon className="w-6 h-6" />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-bold text-slate-100 tracking-tight">
            Platform Runtime Intercept
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed font-mono">
            {errorMessage}
          </p>
        </div>

        {error?.digest && (
          <div className="px-3 py-1.5 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-500">
            Digest: {error.digest}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
          <button
            onClick={() => reset()}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retry Operation</span>
          </button>

          <button
            onClick={handleResetStateAndRetry}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 border border-slate-700 transition-all cursor-pointer"
          >
            <span>Reset Demo State</span>
          </button>

          <Link
            href="/"
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-cyan-400 font-semibold text-xs flex items-center justify-center gap-1.5 border border-cyan-500/20 transition-all"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
