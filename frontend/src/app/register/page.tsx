"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { ArrowRight, CheckCircle2, Eye, EyeOff } from "lucide-react";
import {
  AuthShell,
  AuthCardHeader,
  AuthLabel,
  AuthPrimaryButton,
  AuthAlert,
  authInputClass,
} from "@/components/auth/AuthShell";
import { cn } from "@/lib/utils";

const COMPLIANCE_PACKS = [
  { id: "SOC2_ISO27001", label: "SOC 2 & ISO 27001" },
  { id: "EU_AI_ACT", label: "EU AI Act & NIST AI RMF" },
  { id: "DORA_FINANCIAL", label: "DORA Financial" },
  { id: "HIPAA_HEALTH", label: "HIPAA / PHI" },
];

export default function RegisterPage() {
  const router = useRouter();

  // Active Tab: "new-org" | "invitation"
  const [activeTab, setActiveTab] = useState<"new-org" | "invitation">("new-org");

  // Form Fields for New Organization Registration
  const [orgName, setOrgName] = useState("");
  const [slug, setSlug] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [region, setRegion] = useState("us-east-1");
  const [selectedPacks, setSelectedPacks] = useState<string[]>([
    "SOC2_ISO27001",
    "EU_AI_ACT",
  ]);

  // Form Fields for Invitation Join
  const [inviteToken, setInviteToken] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successReceipt, setSuccessReceipt] = useState<{
    tenantId: string;
    organizationName: string;
    adminEmail: string;
    timestamp: string;
  } | null>(null);

  // Auto-generate slug from organization name
  const handleOrgNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setOrgName(val);
    const derivedSlug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setSlug(derivedSlug);
  };

  const togglePack = (packId: string) => {
    setSelectedPacks((prev) =>
      prev.includes(packId)
        ? prev.filter((p) => p !== packId)
        : [...prev, packId]
    );
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!orgName.trim()) {
      setError("Organization name is required.");
      return;
    }
    if (!adminName.trim()) {
      setError("Administrator full name is required.");
      return;
    }
    if (!adminEmail.trim() || !adminEmail.includes("@")) {
      setError("Valid corporate email is required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await ZoikoShieldApiClient.registerOrganization({
        organizationName: orgName.trim(),
        slug: slug || "org-eval",
        fullName: adminName.trim(),
        email: adminEmail.trim(),
        password,
        region,
        compliancePacks: selectedPacks,
      });

      setSuccessReceipt({
        tenantId: res.tenant.id,
        organizationName: res.tenant.name || orgName,
        adminEmail: res.session.email || adminEmail,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      setError(err.message || "Failed to provision evaluation organization.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInviteJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken.trim()) {
      setError("Please enter a valid invitation token.");
      return;
    }
    router.push(`/accept-invite?token=${encodeURIComponent(inviteToken.trim())}`);
  };

  if (successReceipt) {
    return (
      <AuthShell activeTab="register">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f0fdf4] text-[#16a34a]">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-[24px] font-bold tracking-tight text-[#0f172a]">Your workspace is ready</h1>
          <p className="mt-1.5 text-sm text-[#475569]">
            Your organization and administrator account have been created.
          </p>
        </div>

        <dl className="mt-6 divide-y divide-[#e2e8f0] rounded-xl border border-[#e2e8f0] bg-[#f8fafc] text-[13px]">
          {[
            ["Organization", successReceipt.organizationName],
            ["Tenant ID", successReceipt.tenantId],
            ["Administrator", successReceipt.adminEmail],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-[#64748b]">{label}</dt>
              <dd className="truncate font-semibold text-[#0f172a]">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 space-y-3">
          <AuthPrimaryButton type="button" onClick={() => { window.location.href = "/"; }}>
            Go to dashboard
            <ArrowRight className="h-4 w-4" />
          </AuthPrimaryButton>
          <Link href="/onboarding" className="block text-center text-[13px] font-semibold text-[#e31e24] hover:underline">
            Continue to onboarding
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell activeTab="register">
      <AuthCardHeader title="Create your account" subtitle="Get started with Zoiko Shield in minutes." />

      {/* Mode selector */}
      <div className="mb-5 grid grid-cols-2 rounded-xl bg-[#f1f5f9] p-1 text-[13px]">
        {([
          ["new-org", "New organization"],
          ["invitation", "I have an invite"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setActiveTab(id);
              setError(null);
            }}
            className={cn(
              "rounded-lg px-3 py-2 font-semibold transition",
              activeTab === id ? "bg-[#ffffff] text-[#0f172a] shadow-sm" : "text-[#64748b] hover:text-[#0f172a]"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "new-org" ? (
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <AuthLabel htmlFor="reg-org-name">Organization name</AuthLabel>
            <input
              id="reg-org-name"
              type="text"
              autoComplete="organization"
              required
              value={orgName}
              onChange={handleOrgNameChange}
              placeholder="Apex Cyber Defense"
              className={authInputClass}
            />
            {orgName.trim() && (
              <p className="mt-1.5 text-xs text-[#64748b]">
                Workspace:{" "}
                <input
                  aria-label="Workspace slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().trim())}
                  className="rounded border border-transparent bg-transparent px-1 font-mono text-[#0f172a] hover:border-[#e2e8f0] focus:border-[#e31e24] focus:outline-none"
                />
              </p>
            )}
          </div>

          <div>
            <AuthLabel htmlFor="reg-admin-name">Full name</AuthLabel>
            <input
              id="reg-admin-name"
              type="text"
              autoComplete="name"
              required
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="Jordan Blake"
              className={authInputClass}
            />
          </div>

          <div>
            <AuthLabel htmlFor="reg-admin-email">Work email address</AuthLabel>
            <input
              id="reg-admin-email"
              type="email"
              autoComplete="email"
              required
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="name@company.com"
              className={authInputClass}
            />
          </div>

          <div>
            <AuthLabel htmlFor="reg-password">Password</AuthLabel>
            <div className="relative">
              <input
                id="reg-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
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

          <div>
            <AuthLabel htmlFor="reg-region">Data residency region</AuthLabel>
            <select
              id="reg-region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className={`${authInputClass} cursor-pointer`}
            >
              <option value="us-east-1">US East (N. Virginia)</option>
              <option value="eu-west-1">EU West (Dublin)</option>
              <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
            </select>
          </div>

          <fieldset>
            <legend className="mb-1.5 block text-[13px] font-semibold text-[#0f172a]">Compliance packs</legend>
            <div className="flex flex-wrap gap-2">
              {COMPLIANCE_PACKS.map((pack) => {
                const isChecked = selectedPacks.includes(pack.id);
                return (
                  <button
                    key={pack.id}
                    type="button"
                    role="checkbox"
                    aria-checked={isChecked}
                    onClick={() => togglePack(pack.id)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                      isChecked
                        ? "border-[#e31e24] bg-[#fef2f2] text-[#b91c1c]"
                        : "border-[#e2e8f0] bg-[#ffffff] text-[#475569] hover:border-[#cbd5e1]"
                    )}
                  >
                    {pack.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {error && (
            <AuthAlert tone="error">
              <p>{error}</p>
              {error.toLowerCase().includes("already exists") && (
                <p className="mt-1.5">
                  <Link href="/login" className="font-semibold underline">Log in</Link>
                  {" or "}
                  <Link href="/login?view=reset" className="font-semibold underline">reset your password</Link>.
                </p>
              )}
            </AuthAlert>
          )}

          <AuthPrimaryButton type="submit" isLoading={isLoading}>
            Create account
            {!isLoading && <ArrowRight className="h-4 w-4" />}
          </AuthPrimaryButton>
        </form>
      ) : (
        <form onSubmit={handleInviteJoin} className="space-y-4">
          <p className="text-[13px] leading-relaxed text-[#475569]">
            Team members join an existing organization by invitation. Paste the token or link from your invitation email.
          </p>
          <div>
            <AuthLabel htmlFor="reg-invite-token">Invitation token</AuthLabel>
            <input
              id="reg-invite-token"
              type="text"
              required
              value={inviteToken}
              onChange={(e) => setInviteToken(e.target.value)}
              placeholder="inv-tok-… or full invite link"
              className={authInputClass}
            />
          </div>

          {error && <AuthAlert tone="error">{error}</AuthAlert>}

          <AuthPrimaryButton type="submit">
            Accept invitation
            <ArrowRight className="h-4 w-4" />
          </AuthPrimaryButton>
        </form>
      )}

      <p className="mt-6 text-center text-[13px] text-[#334155]">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-[#e31e24] hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
