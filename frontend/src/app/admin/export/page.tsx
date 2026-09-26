"use client";

import React, { useMemo } from "react";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import { formatTimestamp, truncateHash } from "@/lib/utils";
import { useDemoState } from "@/lib/demo-state";
import { useContractSources, sourceData, sourceList } from "@/lib/contract-state";
import { ContractSurface } from "@/components/contracts/ContractSurface";

/**
 * W36 — Export and offboarding flow.
 *
 * Scope/format, package portability, progress/manifest, legal hold, deletion
 * attestation and backup expiry.
 *
 * The thing this surface exists to prevent is a customer believing they have
 * left when they have not. Two facts make that mistake easy: deleting live
 * data does not delete it from backups, and a legal hold can lawfully keep
 * data that a deletion request asked to destroy. Both are recorded in
 * shield-core and neither was visible anywhere, so a completed deletion run
 * and a fully-purged tenant looked identical.
 *
 * So backup expiry and legal holds are given the same weight here as the
 * deletion status itself, and an attestation is shown with its retained
 * scopes and limitations rather than as a completion tick.
 */

type ExportArtifact = {
  id: string;
  artifact_type: string;
  schema_id: string;
  schema_version: string;
  object_count: number;
  content_hash: string;
  media_type: string;
  size_bytes?: number | null;
};

type ExportJob = {
  id: string;
  purpose: string;
  export_type: string;
  requested_scope?: string;
  formats?: string;
  status: string;
  progress: number;
  failure_code?: string | null;
  requested_by: string;
  created_at: string;
  completed_at?: string | null;
  expires_at?: string | null;
  artifacts?: ExportArtifact[];
};

type ExportManifest = {
  manifest_version: string;
  scope?: string;
  purpose: string;
  generated_at: string;
  schema_versions?: string;
  counts?: string;
  known_limitations?: string;
  legal_hold_state: string;
  completeness_state: string;
  manifest_hash: string;
};

type OffboardingRun = {
  id: string;
  status?: string;
  reason?: string;
  initiated_at?: string;
  initiated_by?: string;
  deletion_request_id?: string | null;
} | null;

type LegalHold = {
  id: string;
  scope: string;
  authority: string;
  reason: string;
  status: string;
  starts_at: string;
  ends_at?: string | null;
  review_at: string;
  released_at?: string | null;
  release_reason?: string | null;
};

type BackupExpiry = {
  id: string;
  backup_class: string;
  retained_until: string;
  final_expiry_expected_at: string;
  verified_expired_at?: string | null;
  status: string;
};

type Attestation = {
  id: string;
  deleted_scopes: string;
  retained_scopes: string;
  legal_hold_refs: string;
  backup_expiry_refs: string;
  limitations: string;
  attestation_hash: string;
  issued_by: string;
  issued_at: string;
} | null;

type RetentionPolicy = {
  id: string;
  basis: string;
  authority: string;
  period_days: number;
  effective_from?: string;
  effective_to?: string | null;
};

function parseJsonArray(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => (typeof v === "string" ? v : JSON.stringify(v)));
    }
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
    }
    return [];
  } catch {
    return raw ? [raw] : [];
  }
}

function exportStatusVariant(status: string) {
  if (status === "READY") return "healthy" as const;
  if (status === "PARTIAL") return "medium" as const;
  if (status === "FAILED" || status === "EXPIRED") return "critical" as const;
  if (status === "CANCELLED") return "neutral" as const;
  return "pending" as const;
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

export default function ExportOffboardingPage() {
  const [state] = useDemoState();
  const tenantId = state.tenant?.id ?? "";

  const specs = useMemo(() => {
    if (!tenantId) return [{ key: "exports", label: "Export jobs", path: "/api/v1/exports" }];
    const base = `/api/v1/tenants/${tenantId}`;
    return [
      { key: "exports", label: "Export jobs", path: "/api/v1/exports" },
      { key: "run", label: "Offboarding run", path: `${base}/offboarding`, optional: true },
      {
        key: "holds",
        label: "Legal holds",
        path: `${base}/offboarding/legal-holds`,
      },
      {
        key: "backups",
        label: "Backup expiry",
        path: `${base}/offboarding/backup-expiry`,
      },
      {
        key: "attestation",
        label: "Deletion attestation",
        path: `${base}/offboarding/deletion-attestation`,
        optional: true,
      },
      {
        key: "retention",
        label: "Retention policy",
        path: `${base}/offboarding/retention-policy`,
        optional: true,
      },
    ];
  }, [tenantId]);

  const evidence = useContractSources(specs);

  const exports = sourceList<ExportJob>(evidence, "exports");
  const run = sourceData<OffboardingRun>(evidence, "run");
  const holds = sourceList<LegalHold>(evidence, "holds");
  const backups = sourceList<BackupExpiry>(evidence, "backups");
  const attestation = sourceData<Attestation>(evidence, "attestation");
  const retention = sourceList<RetentionPolicy>(evidence, "retention");

  const activeHolds = holds.filter((h) => h.status === "ACTIVE");
  const unexpiredBackups = backups.filter((b) => !b.verified_expired_at);

  return (
    <ContractSurface
      contractId="W36"
      title="Export and offboarding"
      purpose="Export scope and format, package portability, progress and manifest, legal hold, deletion attestation and backup expiry."
      evidence={evidence}
    >
      <div className="space-y-4">
        <Section
          title="Export jobs"
          requirement="Scope, format, progress and the manifest that makes the package portable."
          count={exports.length}
        >
          {exports.length === 0 ? (
            <p className="text-xs font-mono text-amber-300">
              No export has been requested for this tenant. Nothing here has been proved
              portable.
            </p>
          ) : (
            <div className="space-y-3">
              {exports.map((job) => {
                const scope = parseJsonArray(job.requested_scope);
                const formats = parseJsonArray(job.formats);
                return (
                  <div
                    key={job.id}
                    className="rounded border border-slate-800 bg-slate-950/40 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={exportStatusVariant(job.status)}>{job.status}</Badge>
                      <span className="text-xs font-semibold text-slate-100">
                        {job.export_type}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        {job.purpose}
                      </span>
                    </div>

                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-slate-900">
                      <div
                        className={`h-full ${job.status === "FAILED" ? "bg-rose-500" : "bg-cyan-500"}`}
                        style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }}
                      />
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-slate-500">
                      {job.progress}% · requested by {job.requested_by} ·{" "}
                      {formatTimestamp(job.created_at)}
                      {job.expires_at && ` · link expires ${formatTimestamp(job.expires_at)}`}
                      {job.failure_code && (
                        <span className="text-rose-300"> · {job.failure_code}</span>
                      )}
                    </p>

                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <div>
                        <p className="text-[11px] font-mono uppercase text-slate-500">
                          Scope
                        </p>
                        <p className="font-mono text-[11px] text-slate-300">
                          {scope.length > 0 ? scope.join(", ") : "not stated"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-mono uppercase text-slate-500">
                          Formats
                        </p>
                        <p className="font-mono text-[11px] text-slate-300">
                          {formats.length > 0 ? formats.join(", ") : "not stated"}
                        </p>
                      </div>
                    </div>

                    {job.artifacts && job.artifacts.length > 0 && (
                      <table className="mt-2 w-full text-[11px] font-mono">
                        <thead>
                          <tr className="border-b border-slate-800 text-left text-slate-500">
                            <th className="py-1">Artifact</th>
                            <th className="py-1">Schema</th>
                            <th className="py-1">Objects</th>
                            <th className="py-1">Hash</th>
                          </tr>
                        </thead>
                        <tbody>
                          {job.artifacts.map((artifact) => (
                            <tr
                              key={artifact.id}
                              className="border-b border-slate-900 last:border-0"
                            >
                              <td className="py-1 text-slate-300">
                                {artifact.artifact_type}
                              </td>
                              <td className="py-1 text-slate-400">
                                {artifact.schema_id}@{artifact.schema_version}
                              </td>
                              <td className="py-1 text-slate-400">
                                {artifact.object_count}
                              </td>
                              <td className="py-1 break-all text-slate-500">
                                {truncateHash(artifact.content_hash)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    <ManifestPanel exportId={job.id} tenantId={tenantId} />
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section
          title="Legal holds"
          requirement="What may lawfully not be deleted, and on whose authority."
          count={activeHolds.length}
        >
          {holds.length === 0 ? (
            <p className="text-xs font-mono text-slate-400">
              No legal hold is recorded for this tenant, so nothing is preserved against a
              deletion request on those grounds.
            </p>
          ) : (
            <div className="space-y-2">
              {holds.map((hold) => (
                <div
                  key={hold.id}
                  className={`rounded border p-2 ${hold.status === "ACTIVE" ? "border-amber-500/40 bg-amber-500/5" : "border-slate-800"}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={hold.status === "ACTIVE" ? "medium" : "neutral"}>
                      {hold.status}
                    </Badge>
                    <span className="text-xs text-slate-200">{hold.reason}</span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-slate-500">
                    authority {hold.authority} · from {formatTimestamp(hold.starts_at)}
                    {hold.ends_at ? ` to ${formatTimestamp(hold.ends_at)}` : " (open-ended)"}{" "}
                    · review {formatTimestamp(hold.review_at)}
                  </p>
                  <p className="font-mono text-[11px] text-slate-600 break-all">
                    scope {hold.scope}
                  </p>
                  {hold.released_at && (
                    <p className="font-mono text-[11px] text-slate-500">
                      released {formatTimestamp(hold.released_at)} —{" "}
                      {hold.release_reason ?? "no reason recorded"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Backup expiry"
          requirement="When the backups still carrying this tenant's data age out. Deletion is not complete until they have."
          count={unexpiredBackups.length}
        >
          {backups.length === 0 ? (
            <p className="text-xs font-mono text-amber-300">
              No backup expiry records exist. If a deletion has run, this surface cannot
              show that the backups carrying that data have aged out — treat the tenant as
              not fully purged.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-left font-mono text-slate-500">
                  <th className="py-1">Backup class</th>
                  <th className="py-1">Retained until</th>
                  <th className="py-1">Final expiry</th>
                  <th className="py-1">Verified</th>
                  <th className="py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((backup) => (
                  <tr key={backup.id} className="border-b border-slate-900 last:border-0">
                    <td className="py-1.5 font-mono text-slate-300">
                      {backup.backup_class}
                    </td>
                    <td className="py-1.5 font-mono text-slate-400">
                      {formatTimestamp(backup.retained_until)}
                    </td>
                    <td className="py-1.5 font-mono text-slate-400">
                      {formatTimestamp(backup.final_expiry_expected_at)}
                    </td>
                    <td
                      className={`py-1.5 font-mono ${backup.verified_expired_at ? "text-emerald-300" : "text-amber-300"}`}
                    >
                      {backup.verified_expired_at
                        ? formatTimestamp(backup.verified_expired_at)
                        : "not verified"}
                    </td>
                    <td className="py-1.5">
                      <Badge
                        variant={
                          backup.status === "EXPIRED_VERIFIED"
                            ? "healthy"
                            : backup.status === "FAILED_VERIFICATION"
                              ? "critical"
                              : "pending"
                        }
                      >
                        {backup.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section
          title="Deletion attestation"
          requirement="What was deleted, what was kept and why — signed, hashed and limited."
        >
          {!attestation ? (
            <div className="space-y-2">
              <p className="text-xs font-mono text-amber-300">
                No deletion attestation has been issued for this tenant.
              </p>
              {run && (
                <p className="font-mono text-[11px] text-slate-500">
                  offboarding run {run.status ?? "unknown status"}
                  {run.initiated_at && ` · started ${formatTimestamp(run.initiated_at)}`}
                  {run.initiated_by && ` by ${run.initiated_by}`}
                  {run.reason && ` · ${run.reason}`}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
              <p className="font-mono text-[11px] text-slate-500">
                issued by {attestation.issued_by} · {formatTimestamp(attestation.issued_at)}
              </p>
              <p className="mt-1 font-mono text-[11px] text-slate-300 break-all">
                hash {truncateHash(attestation.attestation_hash, 16, 12)}
              </p>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div>
                  <p className="text-[11px] font-mono uppercase text-slate-500">Deleted</p>
                  <p className="font-mono text-[11px] text-slate-300">
                    {parseJsonArray(attestation.deleted_scopes).join(", ") || "none listed"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-mono uppercase text-slate-500">
                    Retained
                  </p>
                  <p className="font-mono text-[11px] text-amber-300">
                    {parseJsonArray(attestation.retained_scopes).join(", ") ||
                      "none listed"}
                  </p>
                </div>
              </div>
              {parseJsonArray(attestation.limitations).length > 0 && (
                <div className="mt-2">
                  <p className="text-[11px] font-mono uppercase text-slate-500">
                    Limitations
                  </p>
                  <ul className="mt-0.5 space-y-0.5">
                    {parseJsonArray(attestation.limitations).map((limitation, index) => (
                      <li
                        key={`${index}-${limitation}`}
                        className="font-mono text-[11px] text-amber-300/90"
                      >
                        — {limitation}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-2 font-mono text-[11px] text-slate-600">
                references {parseJsonArray(attestation.legal_hold_refs).length} legal hold(s)
                and {parseJsonArray(attestation.backup_expiry_refs).length} backup expiry
                record(s)
              </p>
            </div>
          )}
        </Section>

        {retention.length > 0 && (
          <Section
            title="Retention schedule"
            requirement="The authority that decides when data may actually be destroyed."
            count={retention.length}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-left font-mono text-slate-500">
                  <th className="py-1">Basis</th>
                  <th className="py-1">Authority</th>
                  <th className="py-1">Period</th>
                  <th className="py-1">Effective</th>
                </tr>
              </thead>
              <tbody>
                {retention.map((policy) => (
                  <tr key={policy.id} className="border-b border-slate-900 last:border-0">
                    <td className="py-1.5 text-slate-200">{policy.basis}</td>
                    <td className="py-1.5 font-mono text-slate-400">{policy.authority}</td>
                    <td className="py-1.5 font-mono text-slate-400">
                      {policy.period_days} days
                    </td>
                    <td className="py-1.5 font-mono text-slate-500">
                      {policy.effective_from ? formatTimestamp(policy.effective_from) : "—"}
                      {policy.effective_to
                        ? ` → ${formatTimestamp(policy.effective_to)}`
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}
      </div>
    </ContractSurface>
  );
}

/**
 * An export package is only portable if its manifest can be read — the
 * manifest is what tells a receiving system which schemas and versions are in
 * the box, and what the sender knew was missing from it.
 */
function ManifestPanel({ exportId, tenantId }: { exportId: string; tenantId: string }) {
  const [manifest, setManifest] = React.useState<ExportManifest | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open || manifest || error) return;
    void (async () => {
      try {
        const response = await fetch(`/api/v1/exports/${exportId}/manifest`, {
          headers: tenantId ? { "x-tenant-id": tenantId } : {},
        });
        if (!response.ok) {
          throw new Error(`Manifest unavailable (${response.status})`);
        }
        const body = await response.json();
        setManifest(
          (body as { data?: ExportManifest })?.data ?? (body as ExportManifest),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [open, exportId, tenantId, manifest, error]);

  return (
    <details
      className="mt-2 rounded border border-slate-800"
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer px-2 py-1 font-mono text-[11px] text-slate-400 hover:text-slate-200">
        manifest
      </summary>
      <div className="px-2 pb-2">
        {error && <p className="font-mono text-[11px] text-rose-300">{error}</p>}
        {!error && !manifest && (
          <p className="font-mono text-[11px] text-slate-500">reading…</p>
        )}
        {manifest && (
          <div className="space-y-1 font-mono text-[11px]">
            <p className="text-slate-300 break-all">
              manifest v{manifest.manifest_version} · hash{" "}
              {truncateHash(manifest.manifest_hash, 12, 10)}
            </p>
            <p className="text-slate-500">
              generated {formatTimestamp(manifest.generated_at)} · purpose{" "}
              {manifest.purpose}
            </p>
            <p
              className={
                manifest.completeness_state === "COMPLETE"
                  ? "text-slate-400"
                  : "text-amber-300"
              }
            >
              completeness {manifest.completeness_state} · legal hold{" "}
              {manifest.legal_hold_state}
            </p>
            <p className="text-slate-500">
              schemas: {parseJsonArray(manifest.schema_versions).join(", ") || "none listed"}
            </p>
            {parseJsonArray(manifest.known_limitations).length > 0 && (
              <ul className="space-y-0.5">
                {parseJsonArray(manifest.known_limitations).map((limitation, index) => (
                  <li key={`${index}-${limitation}`} className="text-amber-300/90">
                    — {limitation}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
