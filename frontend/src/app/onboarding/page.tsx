"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Building2, Info, ClipboardList, Save, Lock, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import OnboardingConsole from "./console";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { useDemoState } from "@/lib/demo-state";
import {
  WorkspacePage, PageHeader, NoticeBanner, KpiGrid, Panel, Pill, StepFlow, EventList,
  ActionButton, type Tone,
} from "@/components/mockup/kit";

const REGIONS = [
  { id: "us-east-1", label: "US East · us-east-1" },
  { id: "us-west-2", label: "US West · us-west-2" },
  { id: "eu-west-2", label: "UK London · eu-west-2" },
  { id: "eu-west-1", label: "EU Ireland · eu-west-1" },
  { id: "eu-central-1", label: "EU Frankfurt · eu-central-1" },
  { id: "ap-south-1", label: "APAC Mumbai · ap-south-1" },
  { id: "ap-southeast-1", label: "APAC Singapore · ap-southeast-1" },
];
const COUNTRIES = [
  { id: "US", label: "United States" },
  { id: "GB", label: "United Kingdom" },
  { id: "DE", label: "Germany" },
  { id: "IE", label: "Ireland" },
  { id: "IN", label: "India" },
  { id: "SG", label: "Singapore" },
];

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Check = { label: string; sub: string; status: string; tone: Tone; blocking: boolean };

function Field({
  id, label, backend, value, onChange, placeholder,
}: { id: string; label: string; backend: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] font-semibold text-slate-300 mb-1">{label} *</label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-[#080c16] border border-[#1e2b44] text-xs text-slate-100 outline-none focus:border-sky-500"
      />
      <div className="text-[10px] text-slate-500 mt-1">Backend field: {backend}</div>
    </div>
  );
}

export default function OrganizationOnboardingPage() {
  const [tab, setTab] = useState("review");
  const [demoState] = useDemoState();

  const [hasUserEdited, setHasUserEdited] = useState(false);
  const [tenantName, setTenantName] = useState(() => demoState.tenant?.organizationName || "");
  const [slug, setSlug] = useState(() => demoState.tenant?.slug || (demoState.tenant?.organizationName ? demoState.tenant.organizationName.toLowerCase().replace(/[^a-z0-9]/g, "-") : ""));
  const [orderId, setOrderId] = useState(() => {
    const oId = demoState.tenant?.orderId;
    return oId && UUID_RE.test(oId) ? oId : "00000000-0000-4000-8000-000000000001";
  });
  const [legalName, setLegalName] = useState(() => demoState.tenant?.legalEntityName || demoState.tenant?.organizationName || "");
  const [ownerEmail, setOwnerEmail] = useState(() => demoState.session?.email || "");
  const [disclosureVersion, setDisclosureVersion] = useState("2026-10");
  const [region, setRegion] = useState(() => demoState.tenant?.homeRegion || "us-east-1");
  const [country, setCountry] = useState(() => {
    const r = demoState.tenant?.homeRegion || "us-east-1";
    return r.startsWith("eu-") ? "GB" : r.startsWith("ap-") ? "SG" : "US";
  });
  const [environment, setEnvironment] = useState(() => demoState.tenant?.environmentName || "PRODUCTION-US-EAST");
  const [dataClass, setDataClass] = useState<"PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED">(
    () => (demoState.tenant?.dataClass as any) || "RESTRICTED"
  );
  const [consent, setConsent] = useState(false);
  const [showPayload, setShowPayload] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!hasUserEdited && demoState.tenant?.organizationName) {
      setTenantName(demoState.tenant.organizationName);
      setSlug(demoState.tenant.slug || demoState.tenant.organizationName.toLowerCase().replace(/[^a-z0-9]/g, "-"));
      if (demoState.tenant.legalEntityName) {
        setLegalName(demoState.tenant.legalEntityName);
      }
      if (demoState.session?.email) {
        setOwnerEmail(demoState.session.email);
      }
      if (demoState.tenant.homeRegion) {
        setRegion(demoState.tenant.homeRegion);
        const r = demoState.tenant.homeRegion;
        if (r === "eu-west-2") setCountry("GB");
        else if (r === "eu-central-1") setCountry("DE");
        else if (r === "ap-southeast-1") setCountry("SG");
        else setCountry("US");
      }
      if (demoState.tenant.orderId && UUID_RE.test(demoState.tenant.orderId)) {
        setOrderId(demoState.tenant.orderId);
      }
      if (demoState.tenant.environmentName) {
        setEnvironment(demoState.tenant.environmentName);
      }
      if (demoState.tenant.dataClass) {
        setDataClass(demoState.tenant.dataClass as any);
      }
    }
  }, [demoState, hasUserEdited]);

  // Mirrors the backend OnboardTenantDto rules so the operator sees a contract
  // failure here instead of as a 400 after submitting.
  const contractErrors = useMemo(() => {
    const e: string[] = [];
    if (!tenantName.trim()) e.push("tenantName is required");
    if (!SLUG_RE.test(slug)) e.push("tenantSlug must be lowercase letters, digits and hyphens");
    if (!UUID_RE.test(orderId)) e.push("orderId must be a UUID");
    if (!legalName.trim()) e.push("legalEntity.legalName is required");
    if (!EMAIL_RE.test(ownerEmail)) e.push("ownerEmail must be a valid address");
    if (!disclosureVersion.trim()) e.push("accessDisclosureVersion is required");
    return e;
  }, [tenantName, slug, orderId, legalName, ownerEmail, disclosureVersion]);

  const checks: Check[] = [
    contractErrors.length === 0
      ? { label: "Schema / API contract", sub: "Request matches OnboardTenantDto", status: "Pass", tone: "emerald", blocking: false }
      : { label: "Schema / API contract", sub: contractErrors[0], status: "Blocked", tone: "rose", blocking: true },
    { label: "Owner activation route", sub: "/accept-invite page implemented", status: "Ready", tone: "emerald", blocking: false },
    { label: "Email invitation delivery", sub: "Transport cannot be assumed operational", status: "Unverified", tone: "amber", blocking: false },
    { label: "Data residency validation", sub: `Confirm ${region} is allowed for this order`, status: "Review", tone: "amber", blocking: false },
    consent
      ? { label: "Owner disclosure consent", sub: "Acknowledgement recorded", status: "Confirmed", tone: "emerald", blocking: false }
      : { label: "Owner disclosure consent", sub: "Acknowledgement outstanding", status: "Pending", tone: "amber", blocking: true },
  ];
  const blockers = checks.filter((c) => c.blocking).length;

  const payload = {
    orderId, tenantName, tenantSlug: slug, homeRegion: region, dataResidencyRegion: region,
    legalEntity: { legalName, countryOfRegistration: country }, ownerEmail, accessDisclosureVersion: disclosureVersion,
  };

  const createTenant = async () => {
    setSubmitting(true);
    setResult(null);
    try {
      const t = await ZoikoShieldApiClient.createOrganization({
        organizationName: tenantName, slug, legalEntityName: legalName, environmentName: environment || "PRODUCTION",
        homeRegion: region, orderId, ownerEmail, accessDisclosureVersion: disclosureVersion, legalCountry: country,
        dataClass,
      });
      setResult({ ok: true, message: `Tenant ${t?.organizationName || tenantName} provisioned. An owner invitation is issued; delivery is not confirmed by this screen.` });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const stepState = (i: number) => (i < 3 ? "done" : i === 3 ? "active" : "pending") as "done" | "active" | "pending";

  return (
    <WorkspacePage
      header={
        <PageHeader
          icon={<Building2 className="w-5 h-5" />}
          title="Organization Onboarding"
          subtitle="Controlled tenant creation · Identity, commercial verification, residency and owner activation"
          actions={<><Pill tone="purple">Tenant Provisioner</Pill><Pill tone="amber">Simulated data</Pill></>}
        />
      }
      banner={
        blockers > 0 ? (
          <NoticeBanner tone="rose" title={`Provisioning blocked — ${blockers} pre-flight ${blockers === 1 ? "gate" : "gates"} open`} body="Resolve the blocking checks below before a real tenant can be created." tag="Not production-ready" />
        ) : (
          <NoticeBanner tone="emerald" icon={<CheckCircle2 className="w-4 h-4" />} title="Pre-flight checks pass — ready to submit" body="Submitting creates a tenant through the onboarding API. Review items remain advisory." tag="Review before submit" />
        )
      }
      kpis={
        <KpiGrid
          items={[
            { label: "Draft requests", value: "06", hint: "Example queue only", tone: "cyan" },
            { label: "Awaiting review", value: "02", hint: "No approvals inferred", tone: "amber" },
            { label: "Blocking validations", value: String(blockers).padStart(2, "0"), hint: "Computed from this draft", tone: blockers ? "rose" : "emerald" },
            { label: "Activated tenants", value: "—", hint: "Not verifiable in demo", tone: "emerald" },
          ]}
        />
      }
      tabs={[{ id: "review", label: "New organization" }]}
      activeTab={tab}
      onTabChange={setTab}
      console={
        <OnboardingConsole
          orderId={orderId}
          setOrderId={(v) => {
            setHasUserEdited(true);
            setOrderId(v);
          }}
          orgName={tenantName}
          setOrgName={(v) => {
            setHasUserEdited(true);
            setTenantName(v);
            setSlug(v.toLowerCase().replace(/[^a-z0-9]/g, "-"));
          }}
          slug={slug}
          setSlug={(v) => {
            setHasUserEdited(true);
            setSlug(v);
          }}
          legalEntity={legalName}
          setLegalEntity={(v) => {
            setHasUserEdited(true);
            setLegalName(v);
          }}
          ownerEmail={ownerEmail}
          setOwnerEmail={(v) => {
            setHasUserEdited(true);
            setOwnerEmail(v);
          }}
          region={region}
          setRegion={(r) => {
            setHasUserEdited(true);
            setRegion(r);
            if (r === "eu-west-2") setCountry("GB");
            else if (r === "eu-central-1") setCountry("DE");
            else if (r === "ap-southeast-1") setCountry("SG");
            else setCountry("US");
          }}
          environment={environment}
          setEnvironment={(v) => {
            setHasUserEdited(true);
            setEnvironment(v);
          }}
          dataClass={dataClass}
          setDataClass={(v) => {
            setHasUserEdited(true);
            setDataClass(v);
          }}
        />
      }
      consoleLabel="Live provisioning console"
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="New organization · Pre-flight review" meta={`Tenant provisioning pipeline · ${tenantName || "Active Organization"}`} className="xl:col-span-2">
          <div className="flex justify-end -mt-2 mb-3"><Pill tone="amber">Draft · not provisioned</Pill></div>
          <StepFlow
            steps={["Identity & Order", "Legal & Owner", "Residency", "Pre-flight", "Activate"].map((l, i) => ({ label: l, state: stepState(i) }))}
          />
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-cyan-300 mt-6 mb-3">Tenant Identity &amp; Commercial Order</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field
              id="tenantName"
              label="Tenant name"
              backend="tenantName"
              value={tenantName}
              onChange={(v) => {
                setHasUserEdited(true);
                setTenantName(v);
                setSlug(v.toLowerCase().replace(/[^a-z0-9]/g, "-"));
              }}
            />
            <Field
              id="tenantSlug"
              label="Tenant slug"
              backend="tenantSlug"
              value={slug}
              onChange={(v) => {
                setHasUserEdited(true);
                setSlug(v);
              }}
            />
            <Field
              id="orderId"
              label="Order reference"
              backend="orderId"
              value={orderId}
              onChange={(v) => {
                setHasUserEdited(true);
                setOrderId(v);
              }}
            />
            <Field
              id="legalName"
              label="Legal entity name"
              backend="legalEntity.legalName"
              value={legalName}
              onChange={(v) => {
                setHasUserEdited(true);
                setLegalName(v);
              }}
            />
            <Field
              id="ownerEmail"
              label="Owner email"
              backend="ownerEmail"
              value={ownerEmail}
              onChange={(v) => {
                setHasUserEdited(true);
                setOwnerEmail(v);
              }}
            />
            <Field
              id="disclosure"
              label="Access disclosure"
              backend="accessDisclosureVersion"
              value={disclosureVersion}
              onChange={(v) => {
                setHasUserEdited(true);
                setDisclosureVersion(v);
              }}
            />
          </div>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-cyan-300 mt-5 mb-3">Region &amp; Required Owner Disclosure</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label htmlFor="region" className="block text-[11px] font-semibold text-slate-300 mb-1">Home region *</label>
              <select
                id="region"
                value={region}
                onChange={(e) => {
                  setHasUserEdited(true);
                  const r = e.target.value;
                  setRegion(r);
                  if (r === "eu-west-2") setCountry("GB");
                  else if (r === "eu-central-1") setCountry("DE");
                  else if (r === "ap-southeast-1") setCountry("SG");
                  else setCountry("US");
                }}
                className="w-full px-3 py-2 rounded-lg bg-[#080c16] border border-[#1e2b44] text-xs text-slate-100"
              >
                {REGIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
              <div className="text-[10px] text-slate-500 mt-1">homeRegion</div>
            </div>
            <div>
              <label htmlFor="country" className="block text-[11px] font-semibold text-slate-300 mb-1">Legal country</label>
              <select
                id="country"
                value={country}
                onChange={(e) => {
                  setHasUserEdited(true);
                  setCountry(e.target.value);
                }}
                className="w-full px-3 py-2 rounded-lg bg-[#080c16] border border-[#1e2b44] text-xs text-slate-100"
              >
                {COUNTRIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <div className="text-[10px] text-slate-500 mt-1">legalEntity.countryOfRegistration</div>
            </div>
            <div>
              <span className="block text-[11px] font-semibold text-slate-300 mb-1">Activation path</span>
              <div className="px-3 py-2 rounded-lg bg-[#080c16] border border-[#1e2b44] text-xs text-slate-100">Owner invitation</div>
              <div className="text-[10px] text-slate-500 mt-1">Activation pending</div>
            </div>
          </div>
          <label className="mt-4 flex items-center gap-3 rounded-lg border border-dashed border-amber-500/40 bg-amber-950/20 px-3 py-2.5 text-xs text-slate-300">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="accent-amber-400" />
            <span><b className="text-amber-300">Required:</b> Owner must acknowledge the access and data-processing disclosure before tenant activation.</span>
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><Lock className="w-3 h-3" />{blockers ? "Provisioning disabled until blocking checks pass" : savedAt ? `Draft saved ${savedAt}` : "Draft not saved"}</span>
            <div className="flex gap-2">
              <ActionButton onClick={() => setSavedAt(new Date().toLocaleTimeString())}><Save className="w-3.5 h-3.5" /> Save Draft</ActionButton>
              <ActionButton primary onClick={() => setShowPayload((v) => !v)}><ClipboardList className="w-3.5 h-3.5" /> Review payload</ActionButton>
              <ActionButton disabled={blockers > 0 || submitting} onClick={createTenant}><Lock className="w-3.5 h-3.5" /> {submitting ? "Creating…" : "Create tenant"}</ActionButton>
            </div>
          </div>
          {showPayload && (
            <div className="mt-3 relative">
              <button type="button" aria-label="Close payload" onClick={() => setShowPayload(false)} className="absolute right-2 top-2 text-slate-500 hover:text-slate-200"><X className="w-3.5 h-3.5" /></button>
              <pre className="text-[11px] font-mono text-slate-300 bg-[#05080f] border border-[#162238] rounded-lg p-3 overflow-x-auto">POST /api/v1/onboarding{"\n"}{JSON.stringify(payload, null, 2)}</pre>
            </div>
          )}
          {result && (
            <div role="status" className={`mt-3 rounded-lg border px-3 py-2 text-xs ${result.ok ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-200" : "border-rose-500/40 bg-rose-950/30 text-rose-200"}`}>
              {result.ok ? result.message : `Provisioning failed: ${result.message}`}
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Pre-flight checks" meta={`${blockers} ${blockers === 1 ? "blocker" : "blockers"}`} metaTone={blockers ? "amber" : "emerald"}>
            <ul className="space-y-2.5">
              {checks.map((c) => (
                <li key={c.label} className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    {c.tone === "rose" ? <X className="w-4 h-4 text-rose-400 shrink-0" /> : c.tone === "emerald" ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
                    <div className="min-w-0"><div className="text-xs font-semibold text-slate-200">{c.label}</div><div className="text-[11px] text-slate-500">{c.sub}</div></div>
                  </div>
                  <Pill tone={c.tone}>{c.status}</Pill>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Engineering contract & handoff" meta="" >
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 -mt-1 mb-3"><Info className="w-3.5 h-3.5" /> What this screen submits</div>
            <dl className="space-y-2.5 text-[11px]">
              <div className="grid grid-cols-3 gap-2"><dt className="text-cyan-300 font-semibold">Onboarding API</dt><dd className="col-span-2 text-slate-300">POST /api/v1/onboarding</dd></div>
              <div className="grid grid-cols-3 gap-2"><dt className="text-cyan-300 font-semibold">Expected DTO</dt><dd className="col-span-2 text-slate-300">orderId, tenantName, tenantSlug, homeRegion, legalEntity, ownerEmail, accessDisclosureVersion</dd></div>
              <div className="grid grid-cols-3 gap-2"><dt className="text-cyan-300 font-semibold">Owner invitation</dt><dd className="col-span-2 text-slate-300">ZS-EML-ORG-002 · Real-time dynamic dispatch via SMTP service</dd></div>
            </dl>
            <p className="text-[10px] text-slate-500 mt-3 border-t border-[#162238] pt-3">Fail-closed release gate: align request payload, prove delivery, verify access policy, then retest end to end.</p>
          </Panel>
        </div>
      </div>

      <Panel title="Provisioning audit preview" meta="Active provisioning transaction pipeline">
        <EventList
          items={[
            { title: "Draft details entered", sub: contractErrors.length ? "Required fields not yet valid" : "Required fields valid", tone: contractErrors.length ? "amber" : "emerald" },
            { title: "Backend contract check", sub: contractErrors.length ? contractErrors.join(" · ") : "Payload matches OnboardTenantDto", tone: contractErrors.length ? "rose" : "emerald" },
            { title: "Owner invite activation", sub: "/accept-invite available · delivery unverified", tone: "cyan" },
          ]}
        />
      </Panel>
    </WorkspacePage>
  );
}
