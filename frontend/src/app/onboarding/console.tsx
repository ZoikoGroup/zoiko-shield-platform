"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import { Building2, Globe2, ShieldCheck, CheckCircle2, ArrowRight, Sparkles, FileText, Lock } from "lucide-react";
import {
  LoadingState,
  UnauthorizedState,
  UnavailableState,
} from "@/components/states/mandatory-ui-states";

import { useDemoState } from "@/lib/demo-state";

export interface OnboardingConsoleProps {
  orderId?: string;
  setOrderId?: (v: string) => void;
  orgName?: string;
  setOrgName?: (v: string) => void;
  slug?: string;
  setSlug?: (v: string) => void;
  legalEntity?: string;
  setLegalEntity?: (v: string) => void;
  ownerEmail?: string;
  setOwnerEmail?: (v: string) => void;
  environment?: string;
  setEnvironment?: (v: string) => void;
  region?: string;
  setRegion?: (v: string) => void;
  dataClass?: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
  setDataClass?: (v: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED") => void;
}

export default function OnboardingPage(props: OnboardingConsoleProps = {}) {
  const router = useRouter();
  const [demoState] = useDemoState();
  const [internalOrderId, setInternalOrderId] = useState(() => props.orderId || demoState.tenant?.orderId || "00000000-0000-4000-8000-000000000001");
  const [internalOrgName, setInternalOrgName] = useState(() => props.orgName || demoState.tenant?.organizationName || "");
  const [internalSlug, setInternalSlug] = useState(() => props.slug || demoState.tenant?.slug || "");
  const [internalLegalEntity, setInternalLegalEntity] = useState(() => props.legalEntity || demoState.tenant?.legalEntityName || demoState.tenant?.organizationName || "");
  const [internalOwnerEmail, setInternalOwnerEmail] = useState(() => props.ownerEmail || demoState.session?.email || "");
  const [internalEnvironment, setInternalEnvironment] = useState(() => props.environment || demoState.tenant?.environmentName || "PRODUCTION-US-EAST");
  const [internalRegion, setInternalRegion] = useState(() => props.region || demoState.tenant?.homeRegion || "us-east-1");
  const [internalDataClass, setInternalDataClass] = useState<"PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED">(() => props.dataClass || (demoState.tenant?.dataClass as any) || "RESTRICTED");

  // Keep internal state synchronized with props when they update
  React.useEffect(() => {
    if (props.orderId !== undefined) setInternalOrderId(props.orderId);
    if (props.orgName !== undefined) setInternalOrgName(props.orgName);
    if (props.slug !== undefined) setInternalSlug(props.slug);
    if (props.legalEntity !== undefined) setInternalLegalEntity(props.legalEntity);
    if (props.ownerEmail !== undefined) setInternalOwnerEmail(props.ownerEmail);
    if (props.environment !== undefined) setInternalEnvironment(props.environment);
    if (props.region !== undefined) setInternalRegion(props.region);
    if (props.dataClass !== undefined) setInternalDataClass(props.dataClass);
  }, [props.orderId, props.orgName, props.slug, props.legalEntity, props.ownerEmail, props.environment, props.region, props.dataClass]);

  const orderId = props.orderId ?? internalOrderId;
  const setOrderId = props.setOrderId ?? setInternalOrderId;
  const orgName = props.orgName ?? internalOrgName;
  const setOrgName = props.setOrgName ?? setInternalOrgName;
  const slug = props.slug ?? internalSlug;
  const setSlug = props.setSlug ?? setInternalSlug;
  const legalEntity = props.legalEntity ?? internalLegalEntity;
  const setLegalEntity = props.setLegalEntity ?? setInternalLegalEntity;
  const ownerEmail = props.ownerEmail ?? internalOwnerEmail;
  const setOwnerEmail = props.setOwnerEmail ?? setInternalOwnerEmail;
  const environment = props.environment ?? internalEnvironment;
  const setEnvironment = props.setEnvironment ?? setInternalEnvironment;
  const region = props.region ?? internalRegion;
  const setRegion = props.setRegion ?? setInternalRegion;
  const dataClass = props.dataClass ?? internalDataClass;
  const setDataClass = props.setDataClass ?? setInternalDataClass;

  const [isLoading, setIsLoading] = useState(false);
  const [provisionedTenant, setProvisionedTenant] = useState<any>(null);
  const [errorState, setErrorState] = useState<"UNAUTHORIZED" | "UNAVAILABLE" | null>(null);
  const [errorReason, setErrorReason] = useState<string>("");

  const handleSeedOrder = () => {
    const hex = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    setOrderId(`${hex()}${hex()}-${hex()}-4${hex().substring(1)}-8${hex().substring(1)}-${hex()}${hex()}${hex()}`);
  };

  const handleOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorState(null);
    try {
      const tenant = await ZoikoShieldApiClient.createOrganization({
        orderId,
        organizationName: orgName,
        slug,
        legalEntityName: legalEntity,
        environmentName: environment,
        homeRegion: region,
        ownerEmail,
        dataClass,
        timezone: "Etc/UTC",
        accessDisclosureVersion: "1",
      });
      setProvisionedTenant(tenant);
    } catch (err: any) {
      console.error("Onboarding Error:", err);
      if (err?.status === 401 || err?.status === 403) {
        setErrorState("UNAUTHORIZED");
        setErrorReason(err?.message || "Cedar policy denied tenant provisioning authority (TENANT_ADMIN required).");
      } else {
        setErrorState("UNAVAILABLE");
        setErrorReason(err?.message || "Regional cell provisioning gateway unreachable.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="surface-card rounded-2xl p-6 border border-slate-800/80 bg-gradient-to-r from-raised via-surface to-canvas shadow-xl space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="pass">ERB-01 STEP 2</Badge>
          <span className="text-xs font-mono text-cyan-400 font-bold">
            COMMERCIAL CHAIN &amp; TENANCY PROVISIONING
          </span>
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">
          Organization &amp; Tenancy Onboarding
        </h1>
        <p className="text-xs text-slate-400">
          Provision tenant isolation boundary bound to an approved Commercial Order (`orderId`), assign legal entity metadata, and bind `TENANT_OWNER` authority.
        </p>
      </div>

      {/* Mandatory UI States Integration */}
      {isLoading && (
        <LoadingState
          title="Provisioning Sovereign Tenancy..."
          message="Allocating isolated database namespace, CMEK encryption keys, and binding TENANT_OWNER authority."
          regionalCell={region}
        />
      )}

      {errorState === "UNAUTHORIZED" && !isLoading && (
        <UnauthorizedState
          title="Provisioning Authority Denied"
          message={errorReason || "Cedar policy requires TENANT_ADMIN role and valid FIDO2 biometric step-up to provision organization boundaries."}
          cedarPolicyDenialReason="CEDAR_POLICY_DENY: TENANT_PROVISION_CHAIN requires TENANT_ADMIN role"
          stepupChallengeRequired={true}
          retryAction={() => setErrorState(null)}
        />
      )}

      {errorState === "UNAVAILABLE" && !isLoading && (
        <UnavailableState
          title="Regional Cell Provisioning Standby"
          message={errorReason || "Regional control plane endpoint is currently in standby failover mode. Please verify regional cell reachability."}
          failoverRegion="eu-central-1"
          rtoTargetMinutes={0.5}
          rpoTargetMinutes={0}
          retryAction={() => setErrorState(null)}
        />
      )}

      {!provisionedTenant ? (
        <Card variant="cyber">
          <form onSubmit={handleOnboard} className="space-y-4">
            {/* Commercial Order Binding */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 font-semibold">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Prerequisite Commercial Order (`orderId`)</span>
                </div>
                <button
                  type="button"
                  onClick={handleSeedOrder}
                  className="text-[11px] font-mono text-purple-400 hover:text-purple-300 underline flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Seed New Commercial Order</span>
                </button>
              </div>
              <input
                type="text"
                required
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-400"
                placeholder="Approved CommercialOrder UUID"
              />
              <p className="text-[11px] text-slate-500">
                Backed by `POST /api/v1/onboarding/organization` (CommercialAccount → Product → Order validation chain).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-300">
                  Organization Display Name:
                </label>
                <input
                  type="text"
                  required
                  value={orgName}
                  onChange={(e) => {
                    setOrgName(e.target.value);
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-"));
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-300">
                  Tenant URI Slug (`^[a-z0-9-]+$`):
                </label>
                <input
                  type="text"
                  required
                  pattern="^[a-z0-9-]+$"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-300">
                  Registered Legal Entity Name:
                </label>
                <input
                  type="text"
                  required
                  value={legalEntity}
                  onChange={(e) => setLegalEntity(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-300">
                  Organization Owner Email:
                </label>
                <input
                  type="email"
                  required
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-300">
                  Sovereign Home Region:
                </label>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
                >
                  <option value="us-east-1">us-east-1 (N. Virginia)</option>
                  <option value="us-west-2">us-west-2 (Oregon)</option>
                  <option value="eu-west-2">eu-west-2 (London)</option>
                  <option value="eu-west-1">eu-west-1 (Ireland)</option>
                  <option value="eu-central-1">eu-central-1 (Frankfurt)</option>
                  <option value="ap-south-1">ap-south-1 (Mumbai)</option>
                  <option value="ap-southeast-1">ap-southeast-1 (Singapore)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-300">
                  Environment Tier:
                </label>
                <input
                  type="text"
                  required
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-300">
                  Data Classification:
                </label>
                <select
                  value={dataClass}
                  onChange={(e) => setDataClass(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
                >
                  <option value="RESTRICTED">RESTRICTED</option>
                  <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                  <option value="INTERNAL">INTERNAL</option>
                  <option value="PUBLIC">PUBLIC</option>
                </select>
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                isLoading={isLoading}
              >
                <Building2 className="w-4 h-4" />
                <span>Provision Isolated Tenant Boundary</span>
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card variant="cyber" className="border-emerald-500/40 bg-emerald-950/10">
          <div className="text-center space-y-4 py-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-bold text-slate-100">
                Tenant Successfully Provisioned
              </h2>
              <p className="text-xs text-slate-400">
                Isolation boundary created and linked to order `{orderId}`.
              </p>
            </div>

            <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 text-left font-mono text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Tenant ID:</span>
                <span className="text-cyan-400 font-bold">{provisionedTenant.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Order ID:</span>
                <span className="text-purple-400">{provisionedTenant.orderId || orderId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Organization:</span>
                <span className="text-slate-200">{provisionedTenant.organizationName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Legal Entity:</span>
                <span className="text-slate-200">{provisionedTenant.legalEntityName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Home Region:</span>
                <span className="text-slate-200">{provisionedTenant.homeRegion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Data Class:</span>
                <span className="text-amber-400">{provisionedTenant.dataClass || dataClass}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <Badge variant="pass">ACTIVE</Badge>
              </div>
            </div>

            {provisionedTenant.ownerInvitation?.activationUrl && (
              <div className="p-3 bg-cyan-950/40 border border-cyan-500/30 rounded-xl text-left font-mono text-xs space-y-1">
                <span className="text-cyan-400 font-bold block">Owner Activation Link (Development):</span>
                <a
                  href={provisionedTenant.ownerInvitation.activationUrl}
                  className="text-slate-300 underline break-all text-[11px] hover:text-cyan-300"
                >
                  {provisionedTenant.ownerInvitation.activationUrl}
                </a>
              </div>
            )}

            <Button
              variant="cyan"
              className="w-full"
              onClick={() => router.push("/team")}
            >
              <span>Continue to Step 3: Invite Team</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
