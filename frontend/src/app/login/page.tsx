"use client";

import React, { Suspense, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ZoikoShieldApiClient, type SsoDiscovery } from "@/lib/api-client";
import { useDemoState } from "@/lib/demo-state";
import { requestPasskeyAssertion, describeCeremonyError } from "@/lib/webauthn";
import { ArrowRight, ArrowLeft, ChevronRight, Eye, EyeOff, Fingerprint } from "lucide-react";
import {
  AuthShell,
  AuthCardHeader,
  AuthLabel,
  AuthPrimaryButton,
  AuthAlert,
  authInputClass,
} from "@/components/auth/AuthShell";

type SsoOption = "microsoft" | "google" | "apple" | "company";

const SSO_OPTIONS: { id: SsoOption; label: string; icon: string; match?: RegExp }[] = [
  { id: "microsoft", label: "Microsoft", icon: "/images/auth/microsoft.svg", match: /microsoft|entra|azure|office/i },
  { id: "google", label: "Google", icon: "/images/auth/google.svg", match: /google/i },
  { id: "apple", label: "Apple", icon: "/images/auth/apple.svg", match: /apple/i },
  { id: "company", label: "Company SSO", icon: "/images/auth/company-sso.svg" },
];

// The email is only prefilled on this device; session lifetime is still set by the backend.
const REMEMBER_KEY = "zoiko_remembered_email";
const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;
const SSO_WORKSPACE_KEY = "zoiko_sso_workspace";

function readRememberedEmail(): string | null {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return null;
    const { email, expiresAt } = JSON.parse(raw);
    if (typeof email === "string" && Date.now() < expiresAt) return email;
    localStorage.removeItem(REMEMBER_KEY);
  } catch {}
  return null;
}

function writeRememberedEmail(email: string | null) {
  try {
    if (email) {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email, expiresAt: Date.now() + REMEMBER_MS }));
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }
  } catch {}
}

function LoginForm() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "reset" ? "reset" : "login";
  const rawRedirect = searchParams.get("redirect") || "/";
  const redirectTarget = /^\/(?!\/)/.test(rawRedirect) ? rawRedirect : "/";
  const wasLoggedOut = searchParams.get("logout") === "true";

  const [, setDemoState] = useDemoState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsStepUp, setNeedsStepUp] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);

  // Company SSO: providers are configured per workspace, so the slug comes first.
  const [ssoRequested, setSsoRequested] = useState<SsoOption | null>(null);
  const [workspace, setWorkspace] = useState("");
  const [ssoChoices, setSsoChoices] = useState<SsoDiscovery | null>(null);
  const [isSsoLoading, setIsSsoLoading] = useState(false);
  const [ssoError, setSsoError] = useState<string | null>(null);

  // Reset password view
  const [resetEmail, setResetEmail] = useState("");
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    const remembered = readRememberedEmail();
    if (remembered) {
      setEmail(remembered);
      setRememberMe(true);
    }
    try {
      setWorkspace(localStorage.getItem(SSO_WORKSPACE_KEY) || "");
    } catch {}
  }, []);

  useEffect(() => {
    if (view === "reset") {
      setResetEmail((current) => current || email);
      setResetSentTo(null);
      setResetError(null);
    }
    // Only when switching views; typing in the login form shouldn't reset this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

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

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);
    setNeedsStepUp(false);
    try {
      const authResult = await ZoikoShieldApiClient.login(email, password);
      writeRememberedEmail(rememberMe ? email.trim() : null);

      setDemoState((prev) => ({
        ...prev,
        session: {
          ...prev.session,
          email,
          fullName: authResult.fullName || email.split("@")[0].replace(/[._]/g, " ").toUpperCase(),
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
      window.location.href = redirectTarget;
    } catch (err: any) {
      const msg = err.message || "Authentication failed";
      setError(msg);
      // Only offer step-up when Cedar policy explicitly requires it, never for
      // unverified emails, wrong credentials, or tenant membership issues.
      const isUnverified = msg.toLowerCase().includes("not verified");
      setNeedsStepUp(
        !isUnverified &&
          (msg.includes("CEDAR_POLICY_DENY") || /authentication step-up required/i.test(msg))
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    const targetEmail = email.trim();
    if (!targetEmail) {
      setError("Please enter your account email address first.");
      return;
    }
    setIsResending(true);
    setResendStatus(null);
    try {
      const res = await ZoikoShieldApiClient.resendVerificationEmail(targetEmail);
      setResendStatus(res.message || "Verification email sent. Please check your inbox.");
    } catch (err: any) {
      setResendStatus(err.message || "Failed to resend verification email.");
    } finally {
      setIsResending(false);
    }
  };

  const handlePasskeyLogin = async () => {
    const targetEmail = email.trim();
    if (!targetEmail) {
      setError("Enter your work email address above, then sign in with your passkey.");
      return;
    }
    setIsPasskeyLoading(true);
    setError(null);
    try {
      const options = await ZoikoShieldApiClient.getPasskeyLoginOptions(targetEmail);
      const assertion = await requestPasskeyAssertion(options);
      const authResult = await ZoikoShieldApiClient.loginWithPasskey(assertion, "");

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
          id: authResult.tenantId || prev.tenant.id,
        },
      }));

      window.location.href = redirectTarget;
    } catch (err: any) {
      console.warn("Passkey sign-in error:", err);
      if (err?.status === 503 || err?.message?.includes("identity service")) {
        setError("Passkey sign-in is unavailable right now. Please sign in with your email and password.");
      } else {
        setError(describeCeremonyError(err, "sign in"));
      }
    } finally {
      setIsPasskeyLoading(false);
    }
  };

  const startSsoWith = async (slug: string, identityProviderId: string) => {
    const { authorizationUrl } = await ZoikoShieldApiClient.startSso({
      tenantSlug: slug,
      identityProviderId,
      returnTo: redirectTarget,
    });
    window.location.href = authorizationUrl;
  };

  const handleSsoContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    const option = SSO_OPTIONS.find((o) => o.id === ssoRequested);
    const slug = workspace.trim().toLowerCase();
    if (!option || !slug) return;

    setIsSsoLoading(true);
    setSsoError(null);
    setSsoChoices(null);
    try {
      const discovery = await ZoikoShieldApiClient.discoverSsoProviders(slug);
      try {
        localStorage.setItem(SSO_WORKSPACE_KEY, slug);
      } catch {}

      const candidates = option.match
        ? discovery.identityProviders.filter((p) => option.match!.test(p.name))
        : discovery.identityProviders;

      if (candidates.length === 0) {
        setSsoError(
          option.match
            ? `${option.label} sign-in isn't set up for ${discovery.tenant.name}. Try Company SSO or ask your administrator.`
            : `${discovery.tenant.name} hasn't enabled single sign-on yet. Sign in with your email instead.`
        );
      } else if (candidates.length === 1) {
        await startSsoWith(discovery.tenant.slug, candidates[0].id);
        return;
      } else {
        setSsoChoices({ ...discovery, identityProviders: candidates });
      }
    } catch (err: any) {
      setSsoError(
        err?.status === 404
          ? `We couldn't find a workspace called "${slug}". Check the name with your administrator.`
          : err?.message || "Single sign-on could not be started."
      );
    } finally {
      setIsSsoLoading(false);
    }
  };

  const handleSsoChoice = async (providerId: string) => {
    if (!ssoChoices) return;
    setIsSsoLoading(true);
    setSsoError(null);
    try {
      await startSsoWith(ssoChoices.tenant.slug, providerId);
    } catch (err: any) {
      setSsoError(err?.message || "Single sign-on could not be started.");
      setIsSsoLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = resetEmail.trim();
    if (!target) return;
    setIsResetSubmitting(true);
    setResetError(null);
    try {
      await ZoikoShieldApiClient.requestPasswordReset(target);
      setResetSentTo(target);
    } catch (err: any) {
      setResetError(err?.message || "We couldn't send a reset link. Please try again.");
    } finally {
      setIsResetSubmitting(false);
    }
  };

  if (view === "reset") {
    return (
      <AuthShell activeTab="reset">
        <AuthCardHeader
          title="Reset your password"
          subtitle="Enter your work email and we'll send you a reset link."
        />

        {resetSentTo ? (
          <div className="space-y-5">
            <AuthAlert tone="success">
              If an account exists for <strong>{resetSentTo}</strong>, a password reset link is on its way.
              Check your inbox and spam folder.
            </AuthAlert>
            <Link
              href="/login"
              scroll={false}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#e31e24] px-4 py-3 text-[15px] font-semibold text-[#ffffff] hover:bg-[#c8161c]"
            >
              Back to log in
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-5">
            <div>
              <AuthLabel htmlFor="reset-email">Work email address</AuthLabel>
              <input
                id="reset-email"
                type="email"
                autoComplete="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="name@company.com"
                className={authInputClass}
              />
            </div>

            {resetError && <AuthAlert tone="error">{resetError}</AuthAlert>}

            <AuthPrimaryButton type="submit" isLoading={isResetSubmitting}>
              Send reset link
              {!isResetSubmitting && <ArrowRight className="h-4 w-4" />}
            </AuthPrimaryButton>

            <Link
              href="/login"
              scroll={false}
              className="flex items-center justify-center gap-1.5 text-sm text-[#475569] hover:text-[#0f172a]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to log in
            </Link>
          </form>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell activeTab="login">
      <AuthCardHeader title="Welcome back!" subtitle="Sign in to your Zoiko Shield account." />

      {wasLoggedOut && (
        <div className="mb-4">
          <AuthAlert tone="success">You&apos;ve been signed out.</AuthAlert>
        </div>
      )}

      <div className="space-y-2">
        {SSO_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            id={`btn-sso-${option.id}`}
            aria-expanded={ssoRequested === option.id}
            onClick={() => {
              setSsoRequested((current) => (current === option.id ? null : option.id));
              setSsoError(null);
              setSsoChoices(null);
            }}
            className={`flex w-full items-center gap-3 rounded-xl border bg-[#ffffff] px-4 py-2.5 text-left text-[15px] font-medium text-[#0f172a] transition hover:border-[#cbd5e1] hover:bg-[#f8fafc] ${
              ssoRequested === option.id ? "border-[#e31e24]" : "border-[#e2e8f0]"
            }`}
          >
            <Image src={option.icon} alt="" width={22} height={22} className="h-[22px] w-[22px]" />
            <span className="flex-1">Continue with {option.label}</span>
            <ChevronRight
              className={`h-4 w-4 text-[#94a3b8] transition-transform ${ssoRequested === option.id ? "rotate-90" : ""}`}
            />
          </button>
        ))}
      </div>

      {ssoRequested && (
        <form onSubmit={handleSsoContinue} className="mt-3 space-y-3 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
          <div>
            <AuthLabel htmlFor="sso-workspace">Company workspace</AuthLabel>
            <div className="flex gap-2">
              <input
                id="sso-workspace"
                type="text"
                autoComplete="organization"
                autoFocus
                required
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                placeholder="your-company"
                className={`${authInputClass} py-2.5`}
              />
              <button
                type="submit"
                disabled={isSsoLoading}
                className="shrink-0 rounded-xl bg-[#0f172a] px-4 text-sm font-semibold text-[#ffffff] hover:bg-[#1e293b] disabled:opacity-60"
              >
                {isSsoLoading ? "…" : "Continue"}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-[#64748b]">The workspace name your administrator gave you.</p>
          </div>

          {ssoChoices && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#475569]">Choose how to sign in to {ssoChoices.tenant.name}:</p>
              {ssoChoices.identityProviders.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  disabled={isSsoLoading}
                  onClick={() => handleSsoChoice(provider.id)}
                  className="flex w-full items-center justify-between rounded-lg border border-[#e2e8f0] bg-[#ffffff] px-3 py-2 text-sm text-[#0f172a] hover:border-[#cbd5e1] disabled:opacity-60"
                >
                  <span>{provider.name}</span>
                  <span className="text-[11px] font-medium text-[#94a3b8]">{provider.protocol}</span>
                </button>
              ))}
            </div>
          )}

          {ssoError && <AuthAlert tone="error">{ssoError}</AuthAlert>}
        </form>
      )}

      <div className="my-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-[#e2e8f0]" />
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#94a3b8]">Or sign in with email</span>
        <span className="h-px flex-1 bg-[#e2e8f0]" />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleLogin();
        }}
        className="space-y-3.5"
      >
        <div>
          <AuthLabel htmlFor="login-email">Work email address</AuthLabel>
          <input
            type="email"
            id="login-email"
            name="login-email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className={authInputClass}
          />
        </div>

        <div>
          <AuthLabel htmlFor="login-password">Password</AuthLabel>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              id="login-password"
              name="login-password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className={`${authInputClass} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#94a3b8] hover:text-[#475569]"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#334155]">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded accent-[#e31e24]"
            />
            Remember me for 30 days
          </label>
          <Link
            href="/login?view=reset"
            scroll={false}
            className="text-[13px] font-semibold text-[#e31e24] hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        {error && (
          <AuthAlert tone="error">
            <p>{error}</p>
            {error.toLowerCase().includes("not verified") && (
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={isResending}
                className="mt-2 font-semibold underline disabled:opacity-50"
              >
                {isResending ? "Sending…" : "Resend verification email"}
              </button>
            )}
            {resendStatus && <p className="mt-1.5 text-[#166534]">{resendStatus}</p>}
            {needsStepUp && (
              <p className="mt-1.5">Your organization requires a passkey for this sign-in. Use the passkey option below.</p>
            )}
          </AuthAlert>
        )}

        <AuthPrimaryButton type="submit" isLoading={isLoading}>
          Log in
          {!isLoading && <ArrowRight className="h-4 w-4" />}
        </AuthPrimaryButton>

        <button
          type="button"
          id="btn-passkey-login"
          onClick={handlePasskeyLogin}
          disabled={isPasskeyLoading}
          className="flex w-full items-center justify-center gap-2 text-[13px] font-medium text-[#475569] hover:text-[#0f172a] disabled:opacity-60"
        >
          <Fingerprint className="h-4 w-4" />
          {isPasskeyLoading ? "Waiting for passkey…" : "Sign in with a passkey"}
        </button>
      </form>

      <p className="mt-4 text-center text-[13px] text-[#334155]">
        New to Zoiko Shield?{" "}
        <Link href="/register" id="link-create-account" prefetch className="font-semibold text-[#e31e24] hover:underline">
          Register
        </Link>
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0b111c]" />}>
      <LoginForm />
    </Suspense>
  );
}
