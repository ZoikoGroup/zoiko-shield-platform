"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import { Lock, Mail, Key, ShieldCheck, ArrowRight, Sparkles } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("analyst@zoikoshield-demo.com");
  const [password, setPassword] = useState("Shield@SecOps2026!");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (targetEmail = email, targetPassword = password) => {
    setIsLoading(true);
    setError(null);
    try {
      await ZoikoShieldApiClient.login(targetEmail, targetPassword);
      router.push("/onboarding");
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  const loginPresets = [
    {
      role: "Lead Security Analyst",
      email: "sarah.chen@acme.com",
      desc: "Full SOAR & Investigation authority",
      variant: "cyan" as const,
    },
    {
      role: "Tenant Owner & Admin",
      email: "owner@acme.com",
      desc: "Tenant provisioning & team management",
      variant: "primary" as const,
    },
    {
      role: "Platform Super Admin",
      email: "admin@zoikoshield.io",
      desc: "Cross-tenant JIT elevation & compliance audit",
      variant: "ai" as const,
    },
  ];

  return (
    <div className="max-w-xl mx-auto py-8 space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center text-slate-950 font-black text-xl shadow-[0_0_30px_rgba(6,182,212,0.4)] mx-auto">
          ZS
        </div>
        <h1 className="text-2xl font-black text-slate-100 tracking-tight">
          ZoikoShield Authentication Gate
        </h1>
        <p className="text-sm text-slate-400">
          ERB-01 Step 1: Federated Login & Approved Password Fallback Session
        </p>
      </div>

      <Card variant="cyber" className="space-y-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-cyan-400" />
              <span>Analyst Identity Email:</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-cyan-400" />
              <span>Password Fallback Credential:</span>
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs font-mono">
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            isLoading={isLoading}
          >
            <Lock className="w-4 h-4" />
            <span>Authenticate & Issue JWT Bearer Token</span>
          </Button>
        </form>

        {/* Demo Quick-Select Presets */}
        <div className="pt-4 border-t border-slate-800 space-y-3">
          <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
            DEMO PRESET ROLES (1-CLICK AUTHENTICATION):
          </span>
          <div className="space-y-2">
            {loginPresets.map((preset, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setEmail(preset.email);
                  handleLogin(preset.email, "Shield@SecOps2026!");
                }}
                className="w-full p-3 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 hover:bg-slate-800/60 transition-all flex items-center justify-between text-left group cursor-pointer"
              >
                <div>
                  <p className="text-xs font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors">
                    {preset.role}
                  </p>
                  <p className="text-[11px] font-mono text-slate-400">
                    {preset.email} • {preset.desc}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
              </button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
