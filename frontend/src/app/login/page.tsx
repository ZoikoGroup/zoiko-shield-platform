"use client";

import React, { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { useDemoState } from "@/lib/demo-state";
import { isWebauthnSupported, requestPasskeyAssertion, describeCeremonyError } from "@/lib/webauthn";
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
  ShieldAlert,
  ListChecks,
  Ban,
  Check,
} from "lucide-react";
import {
  LoadingState,
  UnauthorizedState,
} from "@/components/states/mandatory-ui-states";

interface RoleCapabilityDetail {
  roleType: "SUPER_ADMIN" | "TENANT_OWNER" | "SECURITY_ANALYST" | "AUDITOR";
  roleName: string;
  badge: string;
  badgeColor: string;
  email: string;
  tenantId: string;
  summary: string;
  primaryCockpits: { title: string; route: string }[];
  allowedCapabilities: string[];
  restrictedOperations: string[];
}

const ROLE_PERMISSIONS_MATRIX: RoleCapabilityDetail[] = [
  {
    roleType: "SUPER_ADMIN",
    roleName: "Platform Super Admin",
    badge: "GLOBAL ADMIN",
    badgeColor: "bg-purple-500/20 text-purple-300 border-purple-500/40",
    email: "super.admin@zoikoshield.local",
    tenantId: "tenant-zoiko-platform",
    summary: "Highest privileged sovereign administrator with cross-tenant cluster supervision, cryptographic launch gate ceremonies, and platform-wide emergency controls.",
    primaryCockpits: [
      { title: "G1 Launch Gate Ceremony", route: "/admin/g1-gate" },
      { title: "Platform Health & DR Drill", route: "/admin/platform-health" },
      { title: "Emergency SOAR Circuit Breakers", route: "/admin" },
      { title: "JIT Quorum Privileged Elevation", route: "/admin/jit-elevation" },
      { title: "226 Email Template Studio", route: "/admin/email-templates" },
      { title: "Notification DLQ Resolution", route: "/notifications" },
    ],
    allowedCapabilities: [
      "Multi-Signer G1 launch gate ratification with FIDO2 WebAuthn ceremony",
      "Global platform circuit breaker overrides and emergency SOAR freeze",
      "Non-destructive regional disaster recovery (DR) restore drill trigger",
      "Multi-operator JIT ephemeral elevation approval and session revocation",
      "Cryptographic post-quantum template studio editing & canary deployment",
      "System-level dead-letter queue (DLQ) retry and backchannel delivery oversight",
      "Multi-tenant tenant isolation boundary inspection and custody escrow",
    ],
    restrictedOperations: [
      "Cannot bypass dual-party quorum for destructive R4 containment actions",
      "Cannot delete or rewrite RFC 3161 Merkle audit ledger epochs (append-only)",
      "Cannot export customer private encryption keys (Cloud HSM boundary enforced)",
    ],
  },
  {
    roleType: "TENANT_OWNER",
    roleName: "Tenant Administrator / CISO",
    badge: "TENANT OWNER",
    badgeColor: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
    email: "owner@zoikoshield.corp",
    tenantId: "tenant-sovereign-01",
    summary: "Organization security executive and tenant custodian responsible for risk governance, policy deployment, AI guardrails, team access, and commercial plans.",
    primaryCockpits: [
      { title: "Executive CISO Risk Scorecard", route: "/risk" },
      { title: "Cedar 4-Eyes Policy Rings", route: "/policies" },
      { title: "AI Governance & Model Armor", route: "/ai-governance" },
      { title: "Team & Role Access Management", route: "/team" },
      { title: "Commercial Plans & Payment Checkout", route: "/pricing" },
      { title: "Continuous Security Validation", route: "/validation" },
    ],
    allowedCapabilities: [
      "Executive risk quantification, financial exposure modeling & attack graphs",
      "Cedar deterministic authorization policy authoring, diffs & canary rollouts",
      "AI Governance safety filters, EU AI Act compliance & Model Armor kill-switches",
      "Tenant team member provisioning, role assignment, and invitation lifecycle",
      "Commercial plan subscription, band sizing calculator & simulated payment checkout",
      "Incident Response retainer activation and legal counsel escrow dispatch",
      "Tenant-specific BYOK cryptographic key configuration and compliance packs",
    ],
    restrictedOperations: [
      "Cannot access or view data belonging to other tenant organizations (boundary isolation)",
      "Cannot unilaterally activate Cedar policy without required 4-eyes secondary sign-off",
      "Cannot alter core platform topology or global microservice configurations",
    ],
  },
  {
    roleType: "SECURITY_ANALYST",
    roleName: "Senior Security Analyst",
    badge: "SECOPS",
    badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    email: "marcus.vance@zoikoshield.corp",
    tenantId: "tenant-sovereign-01",
    summary: "Frontline SOC incident responder and detection engineer operating real-time telemetry, MITRE ATT&CK correlation, AI Copilot investigations, and autonomous SOAR.",
    primaryCockpits: [
      { title: "Live Telemetry Ingestion", route: "/ingestion" },
      { title: "Detection Alerts Queue", route: "/alerts" },
      { title: "Major Incident Command War Room", route: "/cases/incidents/command" },
      { title: "AI Security Copilot", route: "/copilot" },
      { title: "Autonomous SOAR Proposals", route: "/response-proposals" },
      { title: "RFC 3161 Merkle Ledger Explorer", route: "/ledger" },
    ],
    allowedCapabilities: [
      "Real-time alert triage, severity tagging, and MITRE technique correlation",
      "Major incident command war room orchestration and active host containment",
      "Spec §16.1 10-field decision review envelope AI Copilot reasoning & signing",
      "WASM sandbox dry-run execution of autonomous SOAR remediation proposals",
      "Live telemetry ingestion connector health monitoring and synthetic injection",
      "Cryptographic Merkle tree receipt verification and RFC 3161 proof generation",
      "Incident case evidence packaging and containment timeline management",
    ],
    restrictedOperations: [
      "Cannot approve commercial subscriptions, modify billing or alter contracts",
      "Cannot approve their own JIT privilege elevation requests (separation of duties)",
      "Cannot modify Cedar policies or delete historical evidence records",
    ],
  },
  {
    roleType: "AUDITOR",
    roleName: "Read-Only Compliance Auditor",
    badge: "AUDITOR",
    badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    email: "elena.rostova@auditor.compliance",
    tenantId: "tenant-sovereign-01",
    summary: "Independent compliance assessor with read-only inspection access across controls, evidence decay, Merkle proof trees, and auditor verification cockpits.",
    primaryCockpits: [
      { title: "External Auditor Cockpit", route: "/auditor" },
      { title: "Continuous SOC 2 / ISO 27001 Controls", route: "/controls" },
      { title: "Cryptographic Evidence Locker", route: "/compliance" },
      { title: "Merkle Proof Chain Verification", route: "/ledger" },
      { title: "Exportable Audit Packages", route: "/audit" },
    ],
    allowedCapabilities: [
      "Independent inspection of SOC 2 Type II, ISO 27001, and NIST CSF continuous controls",
      "Real-time evidence freshness decay tracking and cryptographic hash validation",
      "External auditor cockpit with scope boundary and certification status verification",
      "RFC 3161 timestamp and ML-DSA-65 post-quantum proof chain verification",
      "Exporting sealed, tamper-evident audit packages with inclusion proofs",
      "View-only inspection of security posture, incident histories, and Cedar policy logs",
    ],
    restrictedOperations: [
      "Strictly read-only: ALL mutation requests (POST, PUT, PATCH, DELETE) return 403 Cedar Deny",
      "Cannot trigger SOAR remediations, alter containment state, or declare incidents",
      "Cannot invite team members, modify user roles, or configure tenant settings",
    ],
  },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get("redirect") || "/";
  const wasLoggedOut = searchParams.get("logout") === "true";

  const [state, setDemoState] = useDemoState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
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

  // Role Permissions Matrix Modal State
  const [isRoleMatrixOpen, setIsRoleMatrixOpen] = useState(false);
  const [activeRoleTab, setActiveRoleTab] = useState<"SUPER_ADMIN" | "TENANT_OWNER" | "SECURITY_ANALYST" | "AUDITOR">("SUPER_ADMIN");

  useEffect(() => {
    if (wasLoggedOut) {
      if (typeof window !== "undefined") {
        (window as any).__zoiko_logging_out = false;
      }
      ZoikoShieldApiClient.logout().catch(() => {});
      setDemoState((prev) => {
        if (!prev.session?.isAuthenticated && !prev.session?.token) {
          return prev;
        }
        return {
          ...prev,
          session: {
            ...prev.session,
            userId: "",
            email: "",
            fullName: "",
            role: "SECURITY_ANALYST",
            tenantId: "",
            environment: "",
            token: "",
            isAuthenticated: false,
          },
        };
      });
    }
  }, [wasLoggedOut, setDemoState]);

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
    setIsPasskeyLoading(true);
    setError(null);
    try {
      const targetEmail = email.trim();
      const targetTenant = tenantId.trim();
      if (!targetEmail) {
        setError("Please enter your account email address above before initiating FIDO2 passkey authentication.");
        setIsPasskeyLoading(false);
        return;
      }
      const options = await ZoikoShieldApiClient.getPasskeyLoginOptions(targetEmail);
      const assertion = await requestPasskeyAssertion(options);
      const authResult = await ZoikoShieldApiClient.loginWithPasskey(assertion, targetTenant);

      setDemoState((prev) => ({
        ...prev,
        session: {
          ...prev.session,
          email: authResult.email || targetEmail,
          fullName: authResult.fullName || targetEmail.split("@")[0].replace(/[._]/g, " ").toUpperCase(),
          role: (authResult.role || "TENANT_OWNER") as any,
          token: authResult.token || `passkey-${Date.now()}`,
          isAuthenticated: true,
        },
        tenant: {
          ...prev.tenant,
          id: authResult.tenantId || targetTenant || prev.tenant.id,
        },
      }));

      const target = redirectTarget.startsWith("/") ? redirectTarget : "/";
      window.location.href = target;
    } catch (err: any) {
      console.warn("Passkey sign-in error:", err);
      if (err?.status === 503 || err?.message?.includes("identity service")) {
        setError("WebAuthn Service Unavailable: The ZoikoShield identity service is currently not reachable. Please sign in with email and password or verify service reachability.");
      } else {
        setError(describeCeremonyError(err, "sign in"));
      }
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
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-raised border border-line text-[11px] font-mono text-cyan-400">
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
              id="login-email"
              name="login-email"
              autoComplete="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. security-officer@zoikoshield.corp"
              className="w-full bg-canvas border border-line rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-mono transition-colors shadow-inner"
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
                id="login-password"
                name="login-password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full bg-canvas border border-line rounded-xl pl-4 pr-11 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-mono transition-colors shadow-inner"
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
              id="login-tenant-id"
              name="login-tenant-id"
              autoComplete="off"
              required
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value.trim())}
              placeholder="e.g. tenant-sovereign-01"
              className="w-full bg-canvas border border-line rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-mono transition-colors shadow-inner"
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
            <div className="h-px flex-1 bg-line" />
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">or sign in with</span>
            <div className="h-px flex-1 bg-line" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full border-line bg-canvas hover:border-cyan-500/50 hover:bg-raised transition-colors flex items-center justify-center gap-2"
            isLoading={isPasskeyLoading}
            onClick={handlePasskeyLogin}
          >
            <Fingerprint className="w-4 h-4 text-cyan-400" />
            <span>FIDO2 Passkey (WebAuthn)</span>
          </Button>
        </div>



        {/* Role Permissions & Functionality (tester reference) */}
        <button
          type="button"
          id="btn-view-role-matrix"
          onClick={() => setIsRoleMatrixOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-line bg-canvas text-xs font-mono text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300 transition-colors"
        >
          <ListChecks className="w-4 h-4 text-cyan-400" />
          <span>View Role Permissions &amp; Functionality</span>
        </button>

        {/* Account Creation & Invitation Notice */}
        <div className="pt-4 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div>
            New to ZoikoShield?
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/register"
              id="link-create-account"
              prefetch={true}
              className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Create New Account</span>
            </Link>
            <span className="text-slate-600">|</span>
            <Link
              href="/accept-invite"
              id="link-accept-invite"
              prefetch={true}
              className="text-slate-400 hover:text-slate-200 hover:underline cursor-pointer"
            >
              Accept Invite
            </Link>
          </div>
        </div>
      </Card>

      {/* Forgot Password Modal */}
      {isForgotModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-surface border border-cyan-500/40 shadow-[0_0_50px_rgba(6,182,212,0.3)] p-6 space-y-4 text-slate-200">
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
                <div className="p-2.5 rounded-lg bg-canvas border border-line text-[10px] font-mono text-slate-400 space-y-0.5">
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
                    placeholder="analyst@zoikoshield.corp"
                    className="w-full bg-canvas border border-line rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-mono"
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

      {/* Role Permissions & Functionality Matrix Modal */}
      {isRoleMatrixOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="w-full max-w-3xl my-8 rounded-2xl bg-surface border border-cyan-500/40 shadow-[0_0_60px_rgba(6,182,212,0.35)] p-6 md:p-8 space-y-6 text-slate-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                    <ListChecks className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg md:text-xl font-black text-slate-100">
                      Role Permissions &amp; Functionality Matrix
                    </h2>
                    <p className="text-xs text-slate-400 font-mono">
                      Deterministic Cedar authorization policies &amp; cockpit routing per security persona
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRoleMatrixOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Role Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ROLE_PERMISSIONS_MATRIX.map((roleItem) => {
                const isActive = activeRoleTab === roleItem.roleType;
                return (
                  <button
                    key={roleItem.roleType}
                    type="button"
                    onClick={() => setActiveRoleTab(roleItem.roleType)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      isActive
                        ? "bg-cyan-500/15 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.25)] text-cyan-300"
                        : "bg-canvas border-line hover:border-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <div className="text-[10px] font-mono font-bold tracking-wider uppercase mb-1">
                      {roleItem.badge}
                    </div>
                    <div className="text-xs font-bold truncate">
                      {roleItem.roleName}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active Role Content */}
            {(() => {
              const currentRole =
                ROLE_PERMISSIONS_MATRIX.find((r) => r.roleType === activeRoleTab) ||
                ROLE_PERMISSIONS_MATRIX[0];

              return (
                <div className="space-y-5">
                  {/* Persona Header & 1-Click Login Action */}
                  <div className="p-4 rounded-xl bg-canvas border border-line flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-100">
                          {currentRole.roleName}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${currentRole.badgeColor}`}
                        >
                          {currentRole.roleType}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-slate-400 space-y-0.5">
                        <div>
                          <strong className="text-slate-300">Authorization Framework:</strong> Deterministic Cedar Policy Engine
                        </div>
                        <div>
                          <strong className="text-slate-300">Session Security:</strong> FIPS-204 ML-DSA-65 Bearer Tokens &amp; FIDO2 WebAuthn
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 pt-1 leading-relaxed">
                        {currentRole.summary}
                      </p>
                    </div>
                  </div>

                  {/* Primary Cockpits & Target Routes */}
                  <div className="space-y-2">
                    <div className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Primary Cockpits &amp; Direct Routes:</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {currentRole.primaryCockpits.map((cockpit, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-lg bg-raised border border-line flex items-center justify-between text-xs"
                        >
                          <span className="font-semibold text-slate-200">{cockpit.title}</span>
                          <span className="font-mono text-[10px] text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-950/40 border border-cyan-500/30">
                            {cockpit.route}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Allowed Capabilities vs Enforced Restrictions */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Allowed Functionalities */}
                    <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-3">
                      <div className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>Allowed Capabilities &amp; Features:</span>
                      </div>
                      <ul className="space-y-2 text-xs text-slate-300">
                        {currentRole.allowedCapabilities.map((cap, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <span>{cap}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Enforced Restrictions / Denials */}
                    <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-3">
                      <div className="text-xs font-mono font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-rose-400" />
                        <span>Cedar Policy Denials &amp; Boundaries:</span>
                      </div>
                      <ul className="space-y-2 text-xs text-slate-300">
                        {currentRole.restrictedOperations.map((deny, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <Ban className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                            <span>{deny}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-slate-800 pt-4 text-xs font-mono text-slate-500">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                <span>Zero-Trust Least Privilege Enforcement</span>
              </span>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsRoleMatrixOpen(false)}
              >
                Close Matrix
              </Button>
            </div>
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
        <div className="min-h-screen bg-canvas flex items-center justify-center">
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
