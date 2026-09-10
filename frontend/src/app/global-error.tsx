"use client";

import React, { useEffect } from "react";
import { resetDemoState } from "@/lib/demo-state";
import { AlertOctagon, RotateCcw, RefreshCw } from "lucide-react";

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
      // Ignore
    }
  }
  return "An unexpected root runtime error occurred.";
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("ZoikoShield Global Error Intercepted:", error);
  }, [error]);

  const errorMessage = formatErrorMessage(error);

  const handleHardReset = () => {
    try {
      resetDemoState();
      localStorage.clear();
    } catch {
      // Ignore
    }
    window.location.href = "/";
  };

  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#080a0f] text-slate-100 flex items-center justify-center p-4 antialiased font-sans">
        <div className="max-w-lg w-full bg-[#11141c] border border-cyan-500/30 rounded-2xl p-6 md:p-8 shadow-[0_0_60px_rgba(0,0,0,0.9)] text-center space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center mx-auto text-slate-950 font-black text-xl shadow-[0_0_30px_rgba(6,182,212,0.4)]">
            ZS
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-black text-slate-100 tracking-tight">
              ZoikoShield Root Recovery Gateway
            </h1>
            <p className="text-xs text-slate-400 font-mono leading-relaxed">
              {errorMessage}
            </p>
          </div>

          {error?.digest && (
            <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-500">
              Error Digest: {error.digest}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={() => reset()}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Retry Session</span>
            </button>

            <button
              onClick={handleHardReset}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 border border-slate-700 transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 text-cyan-400" />
              <span>Hard Reset Demo State</span>
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
