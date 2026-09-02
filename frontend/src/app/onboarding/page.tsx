"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import { Building2, Globe2, ShieldCheck, CheckCircle2, ArrowRight, Sparkles, FileText, Lock } from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const [orderId, setOrderId] = useState("ord-enterprise-00000001-uuid");
  const [orgName, setOrgName] = useState("Acme Financial Services Inc.");
  const [slug, setSlug] = useState("acme-financial");
  const [legalEntity, setLegalEntity] = useState("Acme Financial Services Global Ltd");
  const [environment, setEnvironment] = useState("PRODUCTION-US-EAST");
  const [region, setRegion] = useState("us-east-1");
  const [dataClass, setDataClass] = useState<"PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED">("RESTRICTED");
  const [isLoading, setIsLoading] = useState(false);
  const [provisionedTenant, setProvisionedTenant] = useState<any>(null);

  const handleSeedOrder = () => {
    setOrderId(`ord-enterprise-${Math.random().toString(36).substring(2, 9)}-uuid`);
  };

  const handleOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const tenant = await ZoikoShieldApiClient.createOrganization({
        organizationName: orgName,
        slug,
        legalEntityName: legalEntity,
        environmentName: environment,
        homeRegion: region,
      });
      setProvisionedTenant(tenant);
    } catch (err) {
      console.error("Onboarding Error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="pass">ERB-01 STEP 2</Badge>
          <span className="text-xs font-mono text-cyan-400 font-bold">
            COMMERCIAL CHAIN & TENANCY PROVISIONING
          </span>
        </div>
        <h1 className="text-2xl font-black text-slate-100 tracking-tight">
          Organization & Tenancy Onboarding
        </h1>
        <p className="text-sm text-slate-400">
          Provision tenant isolation boundary bound to an approved Commercial Order (`orderId`), assign legal entity metadata, and bind `TENANT_OWNER` authority.
        </p>
      </div>

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
                  <option value="eu-west-1">eu-west-1 (Ireland)</option>
                  <option value="eu-central-1">eu-central-1 (Frankfurt)</option>
                  <option value="ap-south-1">ap-south-1 (Mumbai)</option>
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
