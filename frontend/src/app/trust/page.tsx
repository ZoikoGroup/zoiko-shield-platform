"use client";

import React, { useMemo } from "react";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import { formatTimestamp } from "@/lib/utils";
import { useContractSources, sourceData, sourceList } from "@/lib/contract-state";
import { ContractSurface, UnbackedField } from "@/components/contracts/ContractSurface";

/**
 * W38 — Service status, trust and support center.
 *
 * Current and historical status, regions and services, trust materials,
 * disclosures, secure support, incident communications and subscription.
 *
 * One thing needs stating plainly, because this is the surface a customer
 * reads when deciding whether to believe the platform. The trust-center
 * service returns trustStatus: 'VERIFIED' and securityPosture:
 * 'COMPLIANT_HIGH_ASSURANCE' as string literals — they are not computed from
 * the claims, audit packages or control evidence beneath them, and they do
 * not change when that evidence does. Rendering them as a green banner would
 * be exactly the misleading compliant state UX-INV-03 exists to prevent, so
 * they are shown as unattested assertions and the evidence that does exist —
 * approved claims, frozen audit packages, published artifacts — is what gets
 * the weight.
 */

type TrustOverview = {
  trustStatus?: string;
  securityPosture?: string;
  approvedClaimsCount?: number;
  claims?: {
    claimKey: string;
    claimWording: string;
    scope: string;
    evidenceRequirement: string;
  }[];
  publishedArtifacts?: {
    id: string;
    publishedAt: string;
    artifactType?: string;
    title?: string;
  }[];
  availableAuditPackages?: {
    id: string;
    packageName: string;
    frameworkScope: string;
    frameworkVersion: string;
    status: string;
    frozenAt?: string | null;
  }[];
};

type ServiceHealth = {
  generatedAt?: string;
  connectorHealth?: { healthy: number | null; total: number | null } | string;
  overallHealth?: string;
  aiAvailability?: string;
  actionSimulationHealth?: string;
  evidenceLedgerHealth?: string;
  anchorHealth?: string;
  limitations?: string[];
};

type PublicService = {
  id?: string;
  serviceId?: string;
  name?: string;
  description?: string;
  status?: string;
  regions?: string[];
};

type CapabilityDomain = {
  domain?: string;
  name?: string;
  available?: number;
  total?: number;
  capabilities?: { id?: string; name?: string; available?: boolean }[];
};

function healthTone(value?: string) {
  if (!value || value === "UNKNOWN") return "text-slate-500";
  if (value === "HEALTHY") return "text-emerald-300";
  if (value === "DEGRADED" || value === "PARTIAL") return "text-amber-300";
  return "text-rose-300";
}

function Section({
  title,
  requirement,
  count,
  children,
}: {
  title: string;
  requirement: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Card variant="cyber" className="p-4">
      <div className="mb-3 flex items-baseline justify-between border-b border-slate-800 pb-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          <p className="text-[11px] font-mono text-slate-500">{requirement}</p>
        </div>
        {count !== undefined && (
          <span className="font-mono text-lg text-slate-200">{count}</span>
        )}
      </div>
      {children}
    </Card>
  );
}

export default function TrustCenterPage() {
  const specs = useMemo(
    () => [
      {
        key: "health",
        label: "Service health",
        path: "/api/v1/reporting/service-health",
      },
      {
        key: "trust",
        label: "Trust center overview",
        path: "/api/v1/commercial/trust-center/overview",
      },
      {
        key: "services",
        label: "Public services",
        path: "/api/v1/commercial/capabilities/public-services",
        optional: true,
      },
      {
        key: "domains",
        label: "Capability domains",
        path: "/api/v1/commercial/capabilities/domains",
        optional: true,
      },
    ],
    [],
  );
  const evidence = useContractSources(specs);

  const health = sourceData<ServiceHealth>(evidence, "health");
  const trust = sourceData<TrustOverview>(evidence, "trust");
  const services = sourceList<PublicService>(evidence, "services");
  const domains = sourceList<CapabilityDomain>(evidence, "domains");

  const componentStatuses = [
    {
      label: "Connectors",
      value:
        typeof health?.connectorHealth === "object" && health.connectorHealth
          ? `${health.connectorHealth.healthy ?? "?"} / ${health.connectorHealth.total ?? "?"} healthy`
          : (health?.connectorHealth as string | undefined) ?? "UNKNOWN",
      tone:
        typeof health?.connectorHealth === "object" &&
        health.connectorHealth &&
        health.connectorHealth.healthy === health.connectorHealth.total
          ? "text-emerald-300"
          : "text-amber-300",
    },
    { label: "AI availability", value: health?.aiAvailability ?? "UNKNOWN", tone: healthTone(health?.aiAvailability) },
    {
      label: "Action simulation",
      value: health?.actionSimulationHealth ?? "UNKNOWN",
      tone: healthTone(health?.actionSimulationHealth),
    },
    {
      label: "Evidence ledger",
      value: health?.evidenceLedgerHealth ?? "UNKNOWN",
      tone: healthTone(health?.evidenceLedgerHealth),
    },
    { label: "Anchor", value: health?.anchorHealth ?? "UNKNOWN", tone: healthTone(health?.anchorHealth) },
  ];

  const unknownCount = componentStatuses.filter((c) =>
    String(c.value).includes("UNKNOWN"),
  ).length;

  return (
    <ContractSurface
      contractId="W38"
      title="Service status, trust and support"
      purpose="Current and historical status across regions and services, trust materials and disclosures, secure support, incident communications and status subscription."
      evidence={evidence}
    >
      <div className="space-y-4">
        <Section
          title="Current status"
          requirement="What each component of the platform is doing right now."
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {componentStatuses.map((component) => (
              <div key={component.label} className="rounded border border-slate-800 p-2">
                <p className="text-[11px] font-mono uppercase text-slate-500">
                  {component.label}
                </p>
                <p className={`font-mono text-sm ${component.tone}`}>{component.value}</p>
              </div>
            ))}
          </div>
          {unknownCount > 0 && (
            <p className="mt-2 font-mono text-[11px] text-amber-300">
              {unknownCount} of {componentStatuses.length} components report UNKNOWN. The
              platform cannot currently observe them, which is not the same as their being
              healthy — this page will not show an all-clear while any component is
              unobserved.
            </p>
          )}
          {health?.generatedAt && (
            <p className="mt-1 font-mono text-[11px] text-slate-600">
              read at {formatTimestamp(health.generatedAt)}
            </p>
          )}
          {health?.limitations?.map((limitation, index) => (
            <p
              key={`${index}-${limitation}`}
              className="mt-1 font-mono text-[11px] text-amber-300/80"
            >
              — {limitation}
            </p>
          ))}
        </Section>

        <Section
          title="Status history"
          requirement="Past incidents and degradations, so current status can be read in context."
        >
          <UnbackedField
            label="Historical status timeline"
            requirement="Service health is computed live on each request and never persisted, so there is no record of what the status was yesterday. A status page without history cannot show whether a component has been flapping."
          />
        </Section>

        <Section
          title="Services and regions"
          requirement="What is offered, and where it runs."
          count={services.length}
        >
          {services.length === 0 ? (
            <p className="text-xs font-mono text-slate-400">
              No public service definitions are published.
            </p>
          ) : (
            <div className="space-y-2">
              {services.map((service, index) => (
                <div
                  key={service.id ?? service.serviceId ?? index}
                  className="rounded border border-slate-800 p-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-100">
                      {service.name ?? service.serviceId ?? "unnamed service"}
                    </span>
                    {service.status && <Badge variant="neutral">{service.status}</Badge>}
                  </div>
                  {service.description && (
                    <p className="mt-0.5 text-xs text-slate-400">{service.description}</p>
                  )}
                  <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                    regions:{" "}
                    {service.regions && service.regions.length > 0
                      ? service.regions.join(", ")
                      : "not stated"}
                  </p>
                </div>
              ))}
            </div>
          )}

          {domains.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-[11px] font-mono uppercase text-slate-500">
                Capability domains
              </p>
              <div className="flex flex-wrap gap-2">
                {domains.map((domain, index) => (
                  <span
                    key={domain.domain ?? index}
                    className="rounded border border-slate-800 bg-slate-900/60 px-2 py-1 font-mono text-[11px] text-slate-300"
                  >
                    {domain.name ?? domain.domain}
                    {domain.total !== undefined && (
                      <span className="text-slate-500">
                        {" "}
                        · {domain.available ?? 0}/{domain.total}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Section>

        <Section
          title="Trust posture"
          requirement="What the platform asserts about itself, and what backs it."
        >
          <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-[11px] font-mono uppercase text-amber-200">
              Unattested assertions
            </p>
            <div className="mt-1 grid gap-2 md:grid-cols-2">
              <p className="font-mono text-xs text-slate-300">
                trustStatus:{" "}
                <span className="text-amber-300">{trust?.trustStatus ?? "not stated"}</span>
              </p>
              <p className="font-mono text-xs text-slate-300">
                securityPosture:{" "}
                <span className="text-amber-300">
                  {trust?.securityPosture ?? "not stated"}
                </span>
              </p>
            </div>
            <p className="mt-2 font-mono text-[11px] text-amber-300/80">
              These two values are returned as fixed strings by the trust-center service.
              They are not derived from the claims, audit packages or control evidence
              below, and would read the same if all of it were absent. They are shown here
              for transparency about what the API says, not as a posture rating.
            </p>
          </div>
        </Section>

        <Section
          title="Trust materials"
          requirement="Frozen audit packages and published artifacts a customer can actually be given."
          count={
            (trust?.availableAuditPackages?.length ?? 0) +
            (trust?.publishedArtifacts?.length ?? 0)
          }
        >
          <div className="mb-3">
            <p className="mb-1 text-[11px] font-mono uppercase text-slate-500">
              Audit packages
            </p>
            {!trust?.availableAuditPackages || trust.availableAuditPackages.length === 0 ? (
              <p className="font-mono text-[11px] text-amber-300">
                No approved or frozen audit package is available, so there is nothing here
                an auditor could be handed.
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-left font-mono text-slate-500">
                    <th className="py-1">Package</th>
                    <th className="py-1">Framework</th>
                    <th className="py-1">Status</th>
                    <th className="py-1">Frozen</th>
                  </tr>
                </thead>
                <tbody>
                  {trust.availableAuditPackages.map((pkg) => (
                    <tr key={pkg.id} className="border-b border-slate-900 last:border-0">
                      <td className="py-1.5 text-slate-200">{pkg.packageName}</td>
                      <td className="py-1.5 font-mono text-slate-400">
                        {pkg.frameworkScope} {pkg.frameworkVersion}
                      </td>
                      <td className="py-1.5">
                        <Badge variant={pkg.status === "FROZEN" ? "healthy" : "pending"}>
                          {pkg.status}
                        </Badge>
                      </td>
                      <td className="py-1.5 font-mono text-slate-500">
                        {pkg.frozenAt ? formatTimestamp(pkg.frozenAt) : "not frozen"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div>
            <p className="mb-1 text-[11px] font-mono uppercase text-slate-500">
              Published artifacts
            </p>
            {!trust?.publishedArtifacts || trust.publishedArtifacts.length === 0 ? (
              <p className="font-mono text-[11px] text-slate-500">
                Nothing has been published to the trust center.
              </p>
            ) : (
              <div className="space-y-1">
                {trust.publishedArtifacts.map((artifact) => (
                  <div
                    key={artifact.id}
                    className="flex items-center justify-between rounded border border-slate-800 px-2 py-1.5"
                  >
                    <span className="text-xs text-slate-200">
                      {artifact.title ?? artifact.artifactType ?? artifact.id}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {formatTimestamp(artifact.publishedAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>

        <Section
          title="Disclosures"
          requirement="Claims this platform is permitted to make, in their approved wording."
          count={trust?.claims?.length ?? 0}
        >
          {!trust?.claims || trust.claims.length === 0 ? (
            <p className="text-xs font-mono text-amber-300">
              No approved claims are registered. Nothing on this page has cleared claim
              review, so nothing here should be quoted in a procurement response.
            </p>
          ) : (
            <div className="space-y-2">
              {trust.claims.map((claim) => (
                <div key={claim.claimKey} className="rounded border border-slate-800 p-2">
                  <p className="text-xs text-slate-200">{claim.claimWording}</p>
                  <p className="mt-1 font-mono text-[11px] text-slate-500">
                    {claim.claimKey} · scope {claim.scope} · evidence required:{" "}
                    {claim.evidenceRequirement || "not stated"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Support, incident communications and subscription"
          requirement="A secure channel to raise an issue, the notices sent during an incident, and a way to subscribe to status."
        >
          <div className="space-y-2">
            <UnbackedField
              label="Secure support channel"
              requirement="No support ticket or secure messaging model exists in the platform, so this page cannot open, authenticate or track a support request."
            />
            <UnbackedField
              label="Incident communications"
              requirement="Customer-facing case notes carry an INTERNAL/CUSTOMER classification per case, but there is no tenant-wide communications feed, so published incident notices cannot be assembled here."
            />
            <UnbackedField
              label="Status subscription"
              requirement="Nothing records who has subscribed to status notifications, so no subscription can be offered or honoured from this surface."
            />
          </div>
        </Section>
      </div>
    </ContractSurface>
  );
}
