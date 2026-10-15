"use client";

import React, { useCallback, useEffect, useState } from "react";
import { backend, asList, BackendError } from "@/lib/backend";
import { formatTimestamp } from "@/lib/utils";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import { Layers, RefreshCw, Send } from "lucide-react";
import { LoadingState } from "@/components/states/mandatory-ui-states";

/**
 * W15 — Detection content management.
 *
 * The rules that decide what becomes an alert were invisible. They are
 * registered at boot and published to the database, and until this page there
 * was no way to see which detections exist, which version of each is live,
 * what data each one needs, or what it has matched. A detection nobody can
 * inspect cannot be reviewed, and its alerts cannot be defended.
 *
 * Data prerequisites are shown per version because they are the reason a rule
 * silently does nothing: a detection requiring context the pipeline never
 * resolves will sit PUBLISHED and never match.
 */

type DetectionVersion = {
  id: string;
  version: number;
  status: string;
  severity: string;
  rule_type: string;
  required_event_types: string;
  required_fields: string;
  required_context: string;
  allowed_missing_data_behavior: string;
  published_at: string | null;
  created_at: string;
};

type DetectionDefinition = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  category?: string | null;
  owner?: string | null;
  versions?: DetectionVersion[];
};

type DetectionMatch = {
  id: string;
  detection_version_id: string;
  detected_at: string;
  severity?: string;
};

function parseList(raw: string | undefined): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function severityVariant(severity: string) {
  const s = (severity || "").toUpperCase();
  if (s === "CRITICAL") return "critical" as const;
  if (s === "HIGH") return "high" as const;
  if (s === "MEDIUM") return "medium" as const;
  return "low" as const;
}

export default function DetectionsPage() {
  const [definitions, setDefinitions] = useState<DetectionDefinition[]>([]);
  const [matches, setMatches] = useState<DetectionMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [defs, mts] = await Promise.all([
        backend.get("/api/v1/detections/definitions"),
        // Matches are best-effort: a tenant with none is normal and must not
        // blank out the definitions list.
        backend.get("/api/v1/detections/matches?limit=200").catch(() => []),
      ]);
      setDefinitions(asList<DetectionDefinition>(defs));
      setMatches(asList<DetectionMatch>(mts));
    } catch (err) {
      setError(err instanceof BackendError ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const publish = async (versionId: string) => {
    setPublishing(versionId);
    setError(null);
    try {
      await backend.post(`/api/v1/detections/versions/${versionId}/publish`);
      await load();
    } catch (err) {
      setError(err instanceof BackendError ? err.message : String(err));
    } finally {
      setPublishing(null);
    }
  };

  const matchCount = (versionId: string) =>
    matches.filter((m) => m.detection_version_id === versionId).length;

  if (isLoading) return <LoadingState message="Loading detection content…" />;

  const totalPublished = definitions.reduce(
    (acc, def) => acc + (def.versions?.filter(v => v.status === "PUBLISHED").length || 0),
    0
  );
  const totalMatches = matches.length;
  const noPublishedCount = definitions.filter(
    def => !(def.versions || []).some(v => v.status === "PUBLISHED")
  ).length;

  return (
    <div className="min-h-screen bg-[#060911] text-slate-100 p-6 space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#162238] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Badge variant="info" className="font-mono text-[10px] tracking-wider border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
              SPEC §W15 / CONTENT MANAGEMENT
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-sm shadow-cyan-500/20">
              <Layers className="w-6 h-6" />
            </div>
            <span className="bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent">
              Detection content
            </span>
          </h1>
          <p className="text-xs font-mono text-slate-400 mt-1">
            Every detection, its versions, what each needs to run, and what it has matched.
          </p>
        </div>
        <Button variant="ghost" onClick={() => void load()} className="border border-[#162238] bg-[#0c111e] hover:bg-[#111a2e] text-slate-300">
          <RefreshCw className="w-4 h-4 text-cyan-400" />
          <span>Refresh</span>
        </Button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-mono">
          {error}
        </div>
      )}

      {/* KPI Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="surface-card p-4 border border-[#162238] rounded-xl hover:border-cyan-500/40 transition-all">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-mono">Registered Rules</span>
          <div className="text-2xl font-bold text-white mt-1 font-mono">{definitions.length}</div>
          <span className="text-[10px] text-slate-500 mt-1 inline-block font-mono">Detection definitions</span>
        </Card>
        <Card className="surface-card p-4 border border-[#162238] rounded-xl hover:border-emerald-500/40 transition-all">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-mono">Active Published</span>
          <div className="text-2xl font-bold text-emerald-400 mt-1 font-mono">{totalPublished}</div>
          <span className="text-[10px] text-emerald-400/80 mt-1 inline-block font-mono">Live rule versions</span>
        </Card>
        <Card className="surface-card p-4 border border-[#162238] rounded-xl hover:border-indigo-500/40 transition-all">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-mono">Total Matches</span>
          <div className="text-2xl font-bold text-indigo-300 mt-1 font-mono">{totalMatches}</div>
          <span className="text-[10px] text-indigo-400/80 mt-1 inline-block font-mono">Telemetry events flagged</span>
        </Card>
        <Card className="surface-card p-4 border border-[#162238] rounded-xl hover:border-amber-500/40 transition-all">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-mono">Inert Definitions</span>
          <div className="text-2xl font-bold text-amber-300 mt-1 font-mono">{noPublishedCount}</div>
          <span className="text-[10px] text-amber-400/80 mt-1 inline-block font-mono">No published version</span>
        </Card>
      </div>

      {definitions.length === 0 ? (
        <Card className="surface-card border border-[#162238] p-8 text-center rounded-xl">
          <p className="text-sm font-semibold text-amber-300">No detections are registered.</p>
          <p className="text-xs font-mono text-slate-400 mt-1.5 max-w-md mx-auto">
            Nothing will ever match. Detection definitions are published at
            service boot; if this list is empty, no rule is running.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {definitions.map((definition) => {
            const versions = [...(definition.versions ?? [])].sort(
              (a, b) => b.version - a.version,
            );
            const published = versions.filter((v) => v.status === "PUBLISHED");
            return (
              <Card key={definition.id} className="surface-card p-5 border border-[#162238] rounded-xl hover:border-cyan-500/30 transition-all shadow-md">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white tracking-wide">
                      {definition.name}
                    </h2>
                    <p className="text-xs font-mono text-cyan-400/80 mt-0.5">{definition.key}</p>
                    {definition.description && (
                      <p className="text-xs text-slate-400 mt-1">{definition.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {definition.category && (
                      <Badge variant="neutral" className="font-mono text-[10px]">{definition.category}</Badge>
                    )}
                    {published.length === 0 && (
                      <Badge variant="fail" className="font-mono text-[10px]">NO PUBLISHED VERSION</Badge>
                    )}
                  </div>
                </div>

                {versions.length === 0 ? (
                  <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs font-mono text-amber-300">
                    No versions exist for this definition.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {versions.map((version) => (
                      <div
                        key={version.id}
                        className="border border-[#162238] bg-[#060911] rounded-xl p-3.5 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-slate-200 px-2 py-0.5 rounded bg-[#0c111e] border border-[#162238]">
                              v{version.version}
                            </span>
                            <Badge
                              variant={version.status === "PUBLISHED" ? "pass" : "pending"}
                              className="font-mono text-[10px]"
                            >
                              {version.status}
                            </Badge>
                            <Badge variant={severityVariant(version.severity)} className="font-mono text-[10px]">
                              {version.severity}
                            </Badge>
                            <span className="text-xs font-mono text-slate-400">
                              {version.rule_type}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-cyan-400/80">
                              {matchCount(version.id)} match
                              {matchCount(version.id) === 1 ? "" : "es"}
                            </span>
                            {version.status !== "PUBLISHED" && (
                              <Button
                                variant="primary"
                                size="sm"
                                isLoading={publishing === version.id}
                                onClick={() => void publish(version.id)}
                                className="border border-cyan-500/30 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shadow-sm"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>Publish</span>
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono bg-[#0c111e] p-2.5 rounded-lg border border-[#162238]">
                          <div>
                            <span className="text-slate-500 text-[10px] uppercase font-semibold">event types: </span>
                            <span className="text-slate-300">
                              {parseList(version.required_event_types).join(", ") || "any"}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[10px] uppercase font-semibold">required fields: </span>
                            <span className="text-slate-300">
                              {parseList(version.required_fields).join(", ") || "none"}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[10px] uppercase font-semibold">required context: </span>
                            <span className="text-slate-300">
                              {parseList(version.required_context).join(", ") || "none"}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[10px] uppercase font-semibold">missing data: </span>
                            <span className="text-slate-300">
                              {version.allowed_missing_data_behavior}
                            </span>
                          </div>
                        </div>

                        <p className="text-[11px] font-mono text-slate-500">
                          {version.published_at
                            ? `published ${formatTimestamp(version.published_at)}`
                            : `created ${formatTimestamp(version.created_at)}, never published`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
