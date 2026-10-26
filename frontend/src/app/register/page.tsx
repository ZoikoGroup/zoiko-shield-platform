"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  ShieldCheck,
  Building2,
  Mail,
  User,
  Key,
  Globe,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Lock,
  Layers,
  FileCheck2,
  ExternalLink,
} from "lucide-react";

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

  return (
    <div className="w-full max-w-2xl mx-auto py-10 px-4 space-y-6">
      {/* Header Branding */}
      <div className="text-center space-y-3">
        <Link href="/login" className="inline-block group">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-br from-cyan-500/20 via-blue-600/20 to-purple-600/20 border border-cyan-500/40 shadow-[0_0_35px_rgba(6,182,212,0.3)] group-hover:scale-105 transition-transform">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 via-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-black text-xl shadow-[0_0_20px_rgba(6,182,212,0.5)]">
              ZS
            </div>
          </div>
        </Link>
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-100 tracking-tight">
            Create ZoikoShield Account
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Enterprise Multi-Tenant Sovereign Defense &amp; Governance Platform
          </p>
        </div>
      </div>

      {/* Mode Selector Tabs */}
      <div className="grid grid-cols-2 p-1.5 rounded-xl bg-surface border border-line">
        <button
          type="button"
          onClick={() => {
            setActiveTab("new-org");
            setError(null);
          }}
          className={`py-2 px-3 rounded-lg text-xs font-mono font-bold transition-all ${
            activeTab === "new-org"
              ? "bg-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.4)]"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          New Evaluation Tenant
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("invitation");
            setError(null);
          }}
          className={`py-2 px-3 rounded-lg text-xs font-mono font-bold transition-all ${
            activeTab === "invitation"
              ? "bg-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.4)]"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Join with Invitation Token
        </button>
      </div>

      {/* Success Receipt State */}
      {successReceipt ? (
        <Card variant="cyber" className="p-8 space-y-6 shadow-[0_0_40px_rgba(6,182,212,0.15)] text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto shadow-[0_0_25px_rgba(16,185,129,0.3)]">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-100">
              Evaluation Organization Provisioned!
            </h2>
            <p className="text-xs text-slate-400">
              Your sovereign tenant boundary and initial administrator credential have been recorded.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-canvas border border-line text-left text-xs font-mono space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <span className="text-slate-400">Tenant Name:</span>
              <span className="text-slate-200 font-bold">{successReceipt.organizationName}</span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <span className="text-slate-400">Tenant ID:</span>
              <span className="text-cyan-400 font-bold">{successReceipt.tenantId}</span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <span className="text-slate-400">Administrator:</span>
              <span className="text-slate-200 font-bold">{successReceipt.adminEmail}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Cryptographic Seal:</span>
              <span className="text-emerald-400 font-bold">FIPS-204-SEALED ✓</span>
            </div>
          </div>

          <div className="space-y-3">
            <Button
              variant="primary"
              className="w-full py-3 font-bold"
              onClick={() => { window.location.href = "/"; }}
            >
              <span>Enter Security Operations Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Link
              href="/onboarding"
              className="block text-xs font-mono text-cyan-400 hover:underline"
            >
              Continue to Step-by-Step Onboarding Wizard →
            </Link>
          </div>
        </Card>
      ) : activeTab === "new-org" ? (
        /* Tab 1: Register New Organization */
        <Card variant="cyber" className="p-6 md:p-8 space-y-6 shadow-[0_0_40px_rgba(6,182,212,0.12)]">
          <div className="space-y-1 pb-3 border-b border-line">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-cyan-400" />
              <span>Register Dedicated Evaluation Tenant</span>
            </h2>
            <p className="text-xs text-slate-400">
              Provisions a dedicated cryptographic tenant. You will be assigned as <strong>Tenant Administrator</strong>. All subsequent analysts must be invited via secure tokens.
            </p>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            {/* Organization Name & Slug */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-300 font-semibold">
                  Organization Name:
                </label>
                <input
                  type="text"
                  required
                  value={orgName}
                  onChange={handleOrgNameChange}
                  placeholder="e.g. Apex Cyber Defense"
                  className="w-full bg-canvas border border-line rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-300 font-semibold flex items-center justify-between">
                  <span>Tenant Slug:</span>
                  <span className="text-[10px] text-slate-500">Auto-derived</span>
                </label>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().trim())}
                  placeholder="apex-cyber-defense"
                  className="w-full bg-canvas border border-line rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-cyan-400 font-mono text-xs"
                />
              </div>
            </div>

            {/* Admin Full Name & Email */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-300 font-semibold">
                  Primary Administrator Name:
                </label>
                <input
                  type="text"
                  required
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="e.g. Jordan Blake"
                  className="w-full bg-canvas border border-line rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-300 font-semibold">
                  Corporate Email:
                </label>
                <input
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="jordan.blake@apexdefense.com"
                  className="w-full bg-canvas border border-line rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>
            </div>

            {/* Password with Show/Hide */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-300 font-semibold">
                Administrator Password:
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters (e.g. Secure@Demo2026!)"
                  className="w-full bg-canvas border border-line rounded-xl pl-4 pr-11 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 p-1 text-slate-500 hover:text-cyan-400"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Sovereign Region Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-300 font-semibold flex items-center justify-between">
                <span>Sovereign Cloud Data Residency Region:</span>
                <span className="text-[10px] text-cyan-400 font-bold">Fenced Cell</span>
              </label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full bg-canvas border border-line rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono cursor-pointer"
              >
                <option value="us-east-1">US East (N. Virginia) — FedRAMP High Cell &amp; Dual-Region Partition</option>
                <option value="eu-west-1">EU West (Dublin) — GDPR, DORA &amp; EU AI Act Boundary</option>
                <option value="ap-southeast-1">AP Southeast (Singapore) — Asia-Pacific Sovereign Partition</option>
              </select>
            </div>

            {/* Compliance & Governance Starter Packs */}
            <div className="space-y-2 pt-2">
              <label className="text-xs font-mono text-slate-300 font-semibold block">
                Pre-Activated Compliance &amp; Policy Packs:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { id: "SOC2_ISO27001", label: "SOC 2 Type II & ISO 27001", desc: "Continuous automated controls" },
                  { id: "EU_AI_ACT", label: "EU AI Act & NIST AI RMF", desc: "Model safety & drift monitoring" },
                  { id: "DORA_FINANCIAL", label: "DORA Financial Cloud", desc: "ICT risk & resilience rules" },
                  { id: "HIPAA_HEALTH", label: "HIPAA / PHI Guardian", desc: "Healthcare privacy fences" },
                ].map((pack) => {
                  const isChecked = selectedPacks.includes(pack.id);
                  return (
                    <div
                      key={pack.id}
                      onClick={() => togglePack(pack.id)}
                      className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                        isChecked
                          ? "bg-cyan-950/30 border-cyan-500/50 text-slate-100"
                          : "bg-canvas border-line text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">{pack.label}</span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="accent-cyan-400 rounded"
                        />
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">{pack.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/50 text-rose-300 text-xs font-mono space-y-2 shadow-[0_0_15px_rgba(244,63,94,0.15)]">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{error}</span>
                </div>
                {error.toLowerCase().includes("already exists") && (
                  <div className="pt-2 flex items-center gap-3 border-t border-rose-500/30 text-xs">
                    <Link
                      href="/login"
                      className="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 transition-colors font-bold inline-flex items-center gap-1.5"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Sign In Now</span>
                    </Link>
                    <Link
                      href="/login"
                      className="text-slate-300 hover:text-white underline"
                    >
                      Forgot Password?
                    </Link>
                  </div>
                )}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full py-3 font-bold shadow-[0_0_20px_rgba(6,182,212,0.3)] mt-2"
              isLoading={isLoading}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Provision Evaluation Tenant &amp; Issue Session</span>
            </Button>
          </form>
        </Card>
      ) : (
        /* Tab 2: Join via Invitation Token */
        <Card variant="cyber" className="p-6 md:p-8 space-y-6 shadow-[0_0_40px_rgba(6,182,212,0.12)]">
          <div className="space-y-1 pb-3 border-b border-line">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Mail className="w-4 h-4 text-cyan-400" />
              <span>Join an Existing Organization</span>
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              In accordance with Zero-Trust principles, analysts and operators cannot self-register into an existing tenant. Your organization&apos;s CISO or Tenant Owner must issue an invitation token.
            </p>
          </div>

          <form onSubmit={handleInviteJoin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-300 font-semibold flex items-center justify-between">
                <span>Invitation Token:</span>
                <span className="text-[10px] text-cyan-400 font-bold">From Onboarding Email</span>
              </label>
              <input
                type="text"
                required
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                placeholder="e.g. inv-tok-99214-f89a or full invite URL"
                className="w-full bg-canvas border border-line rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/50 text-rose-300 text-xs font-mono flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full py-2.5 font-bold"
            >
              <span>Verify &amp; Accept Invitation</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>

          <div className="p-4 rounded-xl bg-surface border border-line space-y-2 text-xs text-slate-400">
            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
              <FileCheck2 className="w-4 h-4 text-cyan-400" />
              <span>Invitation-Based Security Guarantees</span>
            </div>
            <ul className="space-y-1 text-[11px] list-disc list-inside text-slate-400">
              <li>Role privileges are pre-assigned by server policy; users cannot self-elevate.</li>
              <li>Tokens are single-use, cryptographically signed, and expire in 48 hours.</li>
              <li>FIDO2 WebAuthn enrollment is enforced on first sign-in.</li>
            </ul>
          </div>
        </Card>
      )}

      {/* Return to Login Link */}
      <div className="text-center pt-2">
        <Link
          href="/login"
          className="text-xs font-mono text-slate-400 hover:text-cyan-400 transition-colors inline-flex items-center gap-1.5"
        >
          <span>Already registered? Return to Sign In</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
