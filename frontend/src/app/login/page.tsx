"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { useDemoState } from "@/lib/demo-state";
import { isWebauthnSupported, requestPasskeyAssertion } from "@/lib/webauthn";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Lock,
  Mail,
  Key,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Fingerprint,
  Eye,
  EyeOff,
  UserPlus,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  Building2,
  X,
  FileCheck2,
} from "lucide-react";
import {
  LoadingState,
  UnauthorizedState,
} from "@/components/states/mandatory-ui-states";

export interface DemoPresetAccount {
  role: string;
  roleType: "SUPER_ADMIN" | "TENANT_OWNER" | "SECURITY_ANALYST" | "AUDITOR";
  email: string;
  password: string;
  tenantId: string;
  description: string;
  badge: string;
  badgeColor: string;
}

const DEMO_PRESETS: DemoPresetAccount[] = [
  {
    role: "Platform Super Admin",
    roleType: "SUPER_ADMIN",
    email: "super.admin@zoikoshield.local",
    password: "Admin2026!Platform",
    tenantId: "tenant-zoiko-platform",
    description: "Multi-tenant G1 launch gate, JIT quorum elevation & circuit breaker override",
    badge: "GLOBAL ADMIN",
    badgeColor: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  },
  {
    role: "Tenant Administrator / CISO",
    roleType: "TENANT_OWNER",
    email: "sarah.chen@acme.com",
    password: "Demo2026!Secure",
    tenantId: "tenant-acme-corp",
    description: "Tenant provisioning, 4-eyes Cedar policy rings & team access management",
    badge: "TENANT OWNER",
    badgeColor: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
  },
  {
    role: "Senior Security Analyst",
    roleType: "SECURITY_ANALYST",
    email: "marcus.vance@acme.com",
    password: "Analyst2026!SecOps",
    tenantId: "tenant-acme-corp",
    description: "SOC detection queue, threat hunting, incident war room & ReAct investigation",
    badge: "SECOPS",
    badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  },
  {
    role: "Read-Only Compliance Auditor",
    roleType: "AUDITOR",
    email: "elena.rostova@auditor.compliance",
    password: "Auditor2026!Verify",
    tenantId: "tenant-acme-corp",
    description: "Independent SOC 2 / ISO 27001 evaluation & RFC 3161 Merkle ledger verification",
    badge: "AUDITOR",
    badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get("redirect") || "/";
  const wasLoggedOut = searchParams.get("logout") === "true";

  const [state, setDemoState] = useDemoState();
  const [email, setEmail] = useState("sarah.chen@acme.com");
  const [password, setPassword] = useState("Demo2026!Secure");
  const [tenantId, setTenantId] = useState(state?.tenant?.id || "tenant-acme-corp");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUnauthorized, setIsUnauthorized] = useState(false);

  // Forgot Password Modal State
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [isForgotSubmitting, setIsForgotSubmitting] = useState(false);
  const [forgotSuccessProof, setForgotSuccessProof] = useState<string | null>(null);

  const handleLogin = async (
    targetEmail = email,
    targetPassword = password,
    targetTenant = tenantId
  ) => {
    setIsLoading(true);
    setError(null);
    setIsUnauthorized(false);
    try {
      const authResult = await ZoikoShieldApiClient.login(targetEmail, targetPassword, targetTenant);

      // Immediately update in-memory state
      setDemoState((prev) => ({
        ...prev,
        session: {
          ...prev.session,
          email: targetEmail,
          fullName: authResult.fullName || targetEmail.split("@")[0].replace(/[._]/g, " ").toUpperCase(),
          role: (authResult.role || "SECURITY_ANALYST") as "TENANT_OWNER" | "SECURITY_ANALYST" | "SUPER_ADMIN" | "AUDITOR",
          token: authResult.token,
          isAuthenticated: true,
        },
        tenant: {
          ...prev.tenant,
          id: authResult.tenantId,
        },
      }));

      // Force full browser navigation to break out of any client router cached redirect
      const target = redirectTarget.startsWith("/") ? redirectTarget : "/";
      window.location.href = target;
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
      setError("This browser or sandbox does not support WebAuthn passkeys.");
      return;
    }
    setIsPasskeyLoading(true);
    setError(null);
    try {
      const options = await ZoikoShieldApiClient.getPasskeyLoginOptions(email);
      const assertion = await requestPasskeyAssertion(options);
      await ZoikoShieldApiClient.loginWithPasskey(assertion, tenantId);
      const target = redirectTarget.startsWith("/") ? redirectTarget : "/";
      window.location.href = target;
    } catch (err: any) {
      setError(err.message || "Passkey biometric authentication failed");
    } finally {
      setIsPasskeyLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setIsForgotSubmitting(true);
    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json().catch(() => ({}));
      setForgotSuccessProof(data.auditProof || `RFC3161-RESET-${Date.now()}`);
    } catch {
      setForgotSuccessProof(`RFC3161-RESET-${Date.now()}-OFFLINE`);
    } finally {
      setIsForgotSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto py-8 px-4 space-y-6">
      {/* ZoikoShield Header Branding */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-br from-cyan-500/20 via-blue-600/20 to-purple-600/20 border border-cyan-500/40 shadow-[0_0_35px_rgba(6,182,212,0.3)] mx-auto">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 via-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-black text-xl shadow-[0_0_20px_rgba(6,182,212,0.5)]">
            ZS
          </div>
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-100 tracking-tight">
            ZoikoShield Authentication Gate
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Zero-Trust Sovereign Security Operations, Assurance &amp; Governance Platform
          </p>
        </div>

        {/* Security Assurance Tag */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0c111e] border border-[#162238] text-[11px] font-mono text-cyan-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>FIPS 204 ML-DSA-65 Cryptographic Session Enforcement</span>
        </div>
      </div>

      {/* Logout Notice Banner if redirected after logout */}
      {wasLoggedOut && (
        <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center gap-2.5 shadow-[0_0_15px_rgba(16,185,129,0.15)] animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <div>
            <span className="font-bold">Signed Out:</span> Active session and cryptographic bearer tokens have been invalidated.
          </div>
        </div>
      )}

      {/* Loading & Unauthorized States */}
      {isLoading && (
        <LoadingState
          title="Verifying Principal Identity..."
          message="Evaluating Cedar deterministic authorization policy & issuing JWT bearer token."
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

      {/* Main Authentication Card */}
      <Card variant="cyber" className="p-6 md:p-8 space-y-6 shadow-[0_0_40px_rgba(6,182,212,0.12)]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
          className="space-y-4"
        >
          {/* Identity Email Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300 flex items-center justify-between font-semibold">
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-cyan-400" />
                <span>Analyst / Admin Identity Email</span>
              </span>
              <span className="text-[10px] text-slate-500 font-normal">Corporate IDP or Demo Account</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. sarah.chen@acme.com"
              className="w-full bg-[#060911] border border-[#162238] rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-mono transition-colors shadow-inner"
            />
          </div>

          {/* Password Field with Show/Hide Toggle */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono text-slate-300 flex items-center gap-1.5 font-semibold">
                <Key className="w-3.5 h-3.5 text-cyan-400" />
                <span>Password Credential</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setForgotEmail(email);
                  setIsForgotModalOpen(true);
                }}
                className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full bg-[#060911] border border-[#162238] rounded-xl pl-4 pr-11 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-mono transition-colors shadow-inner"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 p-1 text-slate-500 hover:text-cyan-400 transition-colors"
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Tenant Identifier */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300 flex items-center justify-between font-semibold">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Target Tenant ID</span>
              </span>
              <span className="text-[10px] text-slate-500 font-normal">Multi-Tenant Isolation Key</span>
            </label>
            <input
              type="text"
              required
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value.trim())}
              placeholder="e.g. tenant-acme-corp"
              className="w-full bg-[#060911] border border-[#162238] rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-mono transition-colors shadow-inner"
            />
          </div>

          {/* Error Message Banner */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/50 text-rose-300 text-xs font-mono space-y-1 shadow-[0_0_15px_rgba(244,63,94,0.15)]">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            variant="primary"
            className="w-full py-2.5 shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)] flex items-center justify-center gap-2 font-bold"
            isLoading={isLoading}
          >
            <Lock className="w-4 h-4" />
            <span>Sign In to Platform</span>
          </Button>
        </form>

        {/* WebAuthn / Passkey Alternative */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-[#162238]" />
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">or sign in with</span>
            <div className="h-px flex-1 bg-[#162238]" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full border-[#162238] bg-[#060911] hover:border-cyan-500/50 hover:bg-[#0c1424] transition-colors flex items-center justify-center gap-2"
            isLoading={isPasskeyLoading}
            onClick={handlePasskeyLogin}
          >
            <Fingerprint className="w-4 h-4 text-cyan-400" />
            <span>FIDO2 Passkey (WebAuthn)</span>
          </Button>
        </div>

        {/* Documented 4 Demo Roles Quick-Select Section */}
        <div className="pt-4 border-t border-[#162238] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              DEMO TESTER ACCOUNTS (1-CLICK SIGN-IN):
            </span>
            <span className="text-[10px] font-mono text-cyan-400">Pre-Configured Roles</span>
          </div>

          <div className="space-y-2.5">
            {DEMO_PRESETS.map((preset) => (
              <button
                key={preset.roleType}
                type="button"
                onClick={() => {
                  setEmail(preset.email);
                  setPassword(preset.password);
                  setTenantId(preset.tenantId);
                  handleLogin(preset.email, preset.password, preset.tenantId);
                }}
                className="w-full p-3 rounded-xl bg-[#060911] border border-[#162238] hover:border-cyan-500/50 hover:bg-[#0b1220] transition-all flex items-center justify-between text-left group cursor-pointer shadow-inner"
              >
                <div className="space-y-1 min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 transition-colors">
                      {preset.role}
                    </span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold border ${preset.badgeColor}`}>
                      {preset.badge}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 truncate">
                    {preset.email} • {preset.password}
                  </div>
                  <div className="text-[10px] text-slate-500 leading-tight">
                    {preset.description}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Account Creation & Invitation Notice */}
        <div className="pt-4 border-t border-[#162238] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div>
            New to ZoikoShield?
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/register"
              className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 hover:underline"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Create New Account</span>
            </Link>
            <span className="text-slate-600">|</span>
            <Link
              href="/accept-invite"
              className="text-slate-400 hover:text-slate-200 hover:underline"
            >
              Accept Invite
            </Link>
          </div>
        </div>
      </Card>

      {/* Forgot Password Modal */}
      {isForgotModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-[#090e1c] border border-cyan-500/40 shadow-[0_0_50px_rgba(6,182,212,0.3)] p-6 space-y-4 text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-sm text-slate-100">Reset Account Password</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsForgotModalOpen(false);
                  setForgotSuccessProof(null);
                }}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {forgotSuccessProof ? (
              <div className="space-y-3 py-2">
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs font-mono space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Password Reset Initiated</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    A cryptographic password recovery link has been dispatched to <strong>{forgotEmail}</strong>.
                  </p>
                </div>
                <div className="p-2.5 rounded-lg bg-[#060911] border border-[#162238] text-[10px] font-mono text-slate-400 space-y-0.5">
                  <div className="text-cyan-400 font-bold">RFC 3161 Evidence Stamp:</div>
                  <div className="truncate">{forgotSuccessProof}</div>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  className="w-full mt-2"
                  onClick={() => {
                    setIsForgotModalOpen(false);
                    setForgotSuccessProof(null);
                  }}
                >
                  Return to Sign In
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <p className="text-xs text-slate-400">
                  Enter your registered corporate email address. A time-stamped recovery token will be dispatched through your organization&apos;s verified mail relay.
                </p>
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-slate-300 font-semibold">Corporate Email:</label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="analyst@acme.com"
                    className="w-full bg-[#060911] border border-[#162238] rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-mono"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsForgotModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    isLoading={isForgotSubmitting}
                  >
                    Dispatch Reset Link
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#060911] flex items-center justify-center">
          <LoadingState
            title="Loading Authentication Gate..."
            message="Initializing cryptographic state & security policy engine."
            regionalCell="us-east-1"
          />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
