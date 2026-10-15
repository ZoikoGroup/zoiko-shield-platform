"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { useDemoState } from "@/lib/demo-state";
import { isWebauthnSupported, requestPasskeyAssertion } from "@/lib/webauthn";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Lock, Mail, Key, ShieldCheck, ArrowRight, Sparkles, Fingerprint } from "lucide-react";
import {
  LoadingState,
  UnauthorizedState,
} from "@/components/states/mandatory-ui-states";

export default function LoginPage() {
  const router = useRouter();
  const [state] = useDemoState();
  const [email, setEmail] = useState("analyst@zoikoshield-demo.com");
  const [password, setPassword] = useState("Shield@SecOps2026!");
  // A principal can belong to more than one tenant, so shield-core requires
  // the sign-in to name one. `npm run seed:dev-tenant` prints the id it
  // provisioned.
  const [tenantId, setTenantId] = useState(state?.tenant?.id || "tenant-acme-corp");
  const [isLoading, setIsLoading] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUnauthorized, setIsUnauthorized] = useState(false);

  const handleLogin = async (targetEmail = email, targetPassword = password) => {
    setIsLoading(true);
    setError(null);
    setIsUnauthorized(false);
    try {
      await ZoikoShieldApiClient.login(targetEmail, targetPassword, tenantId);
      router.push("/onboarding");
    } catch (err: any) {
      const msg = err.message || "Authentication failed";
      setError(msg);
      if (
        msg.includes("Cedar") ||
        msg.includes("FIDO2") ||
        msg.includes("step-up") ||
        err?.status === 403
      ) {
        setIsUnauthorized(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    if (!isWebauthnSupported()) {
      setError("This browser does not support passkeys (WebAuthn).");
      return;
    }
    setIsPasskeyLoading(true);
    setError(null);
    try {
      const options = await ZoikoShieldApiClient.getPasskeyLoginOptions(email);
      const assertion = await requestPasskeyAssertion(options);
      await ZoikoShieldApiClient.loginWithPasskey(assertion, tenantId);
      router.push("/onboarding");
    } catch (err: any) {
      setError(err.message || "Passkey sign-in failed");
    } finally {
      setIsPasskeyLoading(false);
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
    <div className="max-w-xl mx-auto py-10 space-y-8">
      <div className="text-center space-y-2">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center text-slate-950 font-black text-xl shadow-[0_0_35px_rgba(6,182,212,0.4)] mx-auto">
          ZS
        </div>
        <h1 className="text-3xl font-black text-slate-100 tracking-tight">
          ZoikoShield Authentication Gate
        </h1>
        <p className="text-sm text-slate-400">
          ERB-01 Step 1: Federated Login &amp; Approved Password Fallback Session
        </p>
      </div>

      {isLoading && (
        <LoadingState
          title="Verifying Analyst Credentials..."
          message="Evaluating Cedar deterministic policy &amp; issuing JWT bearer token."
          regionalCell="us-east-1"
        />
      )}

      {isUnauthorized && !isLoading && (
        <UnauthorizedState
          title="Authentication Step-Up Required"
          message={error || "Cedar authorization policy rejected token issuance: FIDO2 WebAuthn biometric step-up or valid organization membership required."}
          cedarPolicyDenialReason="CEDAR_POLICY_DENY: Authentication step-up required"
          stepupChallengeRequired={true}
          retryAction={() => setIsUnauthorized(false)}
        />
      )}

      <Card variant="cyber" className="p-8 space-y-6 shadow-[0_0_40px_rgba(6,182,212,0.12)]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300 flex items-center gap-1.5 font-semibold">
              <Mail className="w-3.5 h-3.5 text-cyan-400" />
              <span>Analyst Identity Email:</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#060911] border border-[#162238] rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono transition-colors shadow-inner"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300 flex items-center gap-1.5 font-semibold">
              <Key className="w-3.5 h-3.5 text-cyan-400" />
              <span>Password Fallback Credential:</span>
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#060911] border border-[#162238] rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono transition-colors shadow-inner"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300 flex items-center gap-1.5 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Tenant ID:</span>
            </label>
            <input
              type="text"
              required
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value.trim())}
              className="w-full bg-[#060911] border border-[#162238] rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono transition-colors shadow-inner"
            />
            <p className="text-[10px] font-mono text-slate-500">
              The tenant this sign-in is for. `npm run seed:dev-tenant` prints
              one for a development environment.
            </p>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/50 text-rose-300 text-xs font-mono space-y-1 shadow-[0_0_15px_rgba(244,63,94,0.15)]">
              <div className="font-bold flex items-center gap-1.5">
                <span>{error}</span>
              </div>
              {error.toLowerCase().includes("invalid credentials") && (
                <div className="text-[11px] text-rose-400/90 font-sans">
                  The provided email, password, or tenant ID does not match any active identity. In local development, run <code className="font-mono bg-rose-900/50 px-1 py-0.5 rounded text-rose-200">npm run seed:dev-tenant</code> inside <code className="font-mono bg-rose-900/50 px-1 py-0.5 rounded text-rose-200">backend/</code> to print a valid dev tenant ID and owner credentials.
                </div>
              )}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            className="w-full shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)]"
            isLoading={isLoading}
          >
            <Lock className="w-4 h-4" />
            <span>Authenticate &amp; Issue JWT Bearer Token</span>
          </Button>
        </form>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-[#162238]" />
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">or</span>
          <div className="h-px flex-1 bg-[#162238]" />
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full border-[#162238] bg-[#060911] hover:border-cyan-500/50 hover:bg-[#0c1424] transition-colors"
          isLoading={isPasskeyLoading}
          onClick={handlePasskeyLogin}
        >
          <Fingerprint className="w-4 h-4 text-cyan-400" />
          <span>Sign in with Passkey (WebAuthn)</span>
        </Button>
        <p className="text-[11px] text-slate-500 -mt-2">
          Requires a passkey already enrolled for this email under Team &amp; Invitations → Passkeys.
          Raises session assurance to <span className="text-cyan-400 font-mono font-bold">PASSKEY</span>, unlocking
          step-up gated (<span className="font-mono">@RequireAssurance</span>) actions.
        </p>

        {/* Demo Quick-Select Presets */}
        <div className="pt-4 border-t border-[#162238] space-y-3">
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
                className="w-full p-3.5 rounded-xl bg-[#060911] border border-[#162238] hover:border-cyan-500/40 hover:bg-[#0c1424] transition-all flex items-center justify-between text-left group cursor-pointer shadow-inner"
              >
                <div>
                  <p className="text-xs font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors">
                    {preset.role}
                  </p>
                  <p className="text-[11px] font-mono text-slate-400 mt-0.5">
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
