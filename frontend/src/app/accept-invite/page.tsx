"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { LoadingState, UnavailableState } from "@/components/states/mandatory-ui-states";
import {
  ShieldCheck,
  Building2,
  Globe2,
  Mail,
  FileText,
  KeyRound,
  CheckCircle,
  AlertCircle,
  ExternalLink,
} from "lucide-react";

interface OwnerInvitationData {
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  environment: {
    id: string;
    name: string;
    type: string;
    region: string;
  };
  owner: {
    email: string;
    authentication: string;
  };
  accessDisclosure: {
    version: string;
    contentHash: string;
    content: string;
  };
  identityProviders: Array<{
    id: string;
    name: string;
    protocol: string;
  }>;
  expiresAt: string;
}

function AcceptInviteInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invitation, setInvitation] = useState<OwnerInvitationData | null>(null);
  const [selectedIdp, setSelectedIdp] = useState<string>("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successRedirect, setSuccessRedirect] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("No invitation token found in the URL. Please use the activation link from your onboarding email.");
      setIsLoading(false);
      return;
    }

    const fetchInvitation = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/v1/auth/owner-invitations/${encodeURIComponent(token)}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Failed to load invitation (HTTP ${res.status})`);
        }
        const data: OwnerInvitationData = await res.json();
        setInvitation(data);
        if (data.identityProviders && data.identityProviders.length > 0) {
          setSelectedIdp(data.identityProviders[0].id);
        }
      } catch (err: any) {
        setError(err.message || "Failed to inspect invitation token.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchInvitation();
  }, [token]);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !invitation) return;
    if (!acceptedTerms) {
      setError("You must review and accept the Access Disclosure terms to activate your organization.");
      return;
    }
    if (!selectedIdp && invitation.identityProviders?.length > 0) {
      setError("Please select an identity provider configuration.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/auth/owner-invitations/${encodeURIComponent(token)}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identityProviderId: selectedIdp || (invitation.identityProviders[0]?.id ?? ""),
          accessDisclosureVersion: invitation.accessDisclosure.version,
          accessDisclosureAccepted: true,
          returnTo: "/onboarding",
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Activation failed (HTTP ${res.status})`);
      }

      const result = await res.json();
      if (result.authorizationUrl) {
        setSuccessRedirect(result.authorizationUrl);
        window.location.href = result.authorizationUrl;
      } else {
        router.push("/login");
      }
    } catch (err: any) {
      setError(err.message || "Failed to start owner activation session.");
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <LoadingState
          title="Verifying Sovereign Owner Token..."
          message="Inspecting cryptographic invitation token, tenant cryptographic boundary, and policy disclosure version."
        />
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="max-w-2xl mx-auto py-12 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            Invalid or Expired Activation Token
          </h1>
          <p className="text-sm text-slate-400">
            ZoikoShield Tenancy Activation Gateway
          </p>
        </div>
        <Card variant="cyber" className="p-6 space-y-4">
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-mono">
            {error}
          </div>
          <p className="text-xs text-slate-400">
            Owner invitation tokens are single-use and expire within 72 hours. If you need a new activation link, please contact your organization administrator or platform operations.
          </p>
          <div className="pt-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push("/login")}
            >
              Return to Login
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-8">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center text-slate-950 font-black text-xl shadow-[0_0_30px_rgba(6,182,212,0.4)] mx-auto">
          ZS
        </div>
        <div className="inline-flex items-center gap-2">
          <Badge variant="pass">SOVEREIGN ONBOARDING</Badge>
          <span className="text-xs font-mono text-cyan-400 font-bold">
            TENANT OWNER ACTIVATION
          </span>
        </div>
        <h1 className="text-3xl font-black text-slate-100 tracking-tight">
          Activate Your ZoikoShield Workspace
        </h1>
        <p className="text-sm text-slate-400">
          Review legal entity metadata, accept access disclosures, and authenticate with ZoikoID.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/50 text-rose-300 text-xs font-mono flex items-center gap-2 shadow-[0_0_15px_rgba(244,63,94,0.15)]">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {successRedirect && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/50 text-emerald-300 text-xs font-mono flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
          <CheckCircle className="w-4 h-4 flex-shrink-0 text-emerald-400 animate-pulse" />
          <span>Activation token accepted! Redirecting to secure identity verification...</span>
        </div>
      )}

      {invitation && (
        <form onSubmit={handleActivate} className="space-y-6">
          {/* Tenant & Environment Overview */}
          <Card variant="cyber" className="p-6 space-y-4">
            <h2 className="text-sm font-mono font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Building2 className="w-4 h-4 text-cyan-400" />
              <span>Target Organization &amp; Environment</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-3.5 bg-canvas rounded-xl border border-line space-y-1 shadow-inner">
                <span className="text-slate-500 block">Organization Name</span>
                <span className="text-slate-100 font-bold">{invitation.tenant.name}</span>
                <span className="text-slate-500 text-[10px] block">Slug: {invitation.tenant.slug}</span>
              </div>
              <div className="p-3.5 bg-canvas rounded-xl border border-line space-y-1 shadow-inner">
                <span className="text-slate-500 block">Environment &amp; Region</span>
                <span className="text-cyan-400 font-bold">{invitation.environment.name}</span>
                <span className="text-slate-400 text-[10px] block">
                  Region: {invitation.environment.region} ({invitation.environment.type})
                </span>
              </div>
              <div className="p-3.5 bg-canvas rounded-xl border border-line space-y-1 shadow-inner">
                <span className="text-slate-500 block">Invited Owner Identity</span>
                <span className="text-slate-200 font-bold flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-cyan-400" />
                  {invitation.owner.email}
                </span>
              </div>
              <div className="p-3.5 bg-canvas rounded-xl border border-line space-y-1 shadow-inner">
                <span className="text-slate-500 block">Token Expiration</span>
                <span className="text-amber-400 font-bold">
                  {new Date(invitation.expiresAt).toLocaleString()}
                </span>
              </div>
            </div>
          </Card>

          {/* Access Disclosure Terms */}
          <Card variant="cyber" className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-mono font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                <span>Access Disclosure &amp; Policy Baseline</span>
              </h2>
              <Badge variant="neutral">
                v{invitation.accessDisclosure.version}
              </Badge>
            </div>
            <div className="p-4 bg-canvas rounded-xl border border-line text-[11px] font-mono text-slate-300 max-h-48 overflow-y-auto leading-relaxed whitespace-pre-wrap shadow-inner">
              {invitation.accessDisclosure.content || (
                "By activating this tenant organization on the ZoikoShield Platform, you affirm that you are the authorized representative of the legal entity. All telemetry, audit trails, and Merkle ledger entries within this tenant will be cryptographically anchored and accessible according to your organization's role-based and Cedar deterministic policies."
              )}
            </div>
            <label className="flex items-start gap-2.5 pt-2 cursor-pointer select-none">
              <input
                type="checkbox"
                required
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-400"
              />
              <span className="text-xs text-slate-300">
                I have reviewed and agree to the Access Disclosure and Data Residency terms for version{" "}
                <span className="font-mono text-cyan-400 font-bold">{invitation.accessDisclosure.version}</span>.
              </span>
            </label>
          </Card>

          {/* Identity Provider Selection */}
          {invitation.identityProviders && invitation.identityProviders.length > 0 && (
            <Card variant="cyber" className="p-6 space-y-3">
              <h2 className="text-sm font-mono font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-cyan-400" />
                <span>Authentication Authority (ZoikoID)</span>
              </h2>
              <div className="space-y-2">
                {(invitation.identityProviders || []).map((idp) => (
                  <label
                    key={idp.id}
                    className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedIdp === idp.id
                        ? "bg-gradient-to-r from-cyan-950/50 to-surface border-cyan-400/80 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.15)] ring-1 ring-cyan-400/30"
                        : "bg-canvas border-line text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name="idp"
                        value={idp.id}
                        checked={selectedIdp === idp.id}
                        onChange={() => setSelectedIdp(idp.id)}
                        className="text-cyan-500 border-slate-700 bg-slate-900 focus:ring-cyan-400"
                      />
                      <span className="text-xs font-mono font-bold text-slate-200">{idp.name}</span>
                    </div>
                    <span className="text-[10px] font-mono uppercase bg-surface border border-line px-2 py-0.5 rounded text-slate-300">
                      {idp.protocol}
                    </span>
                  </label>
                ))}
              </div>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              className="w-full sm:flex-1"
              isLoading={isSubmitting}
              disabled={!acceptedTerms || isSubmitting}
            >
              <CheckCircle className="w-4 h-4" />
              <span>Accept &amp; Complete Owner Activation</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto border-line bg-surface hover:border-slate-700"
              onClick={() => router.push("/login")}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-2xl mx-auto py-12">
          <LoadingState
            title="Initializing Activation Portal..."
            message="Loading activation gateway components."
          />
        </div>
      }
    >
      <AcceptInviteInner />
    </Suspense>
  );
}
