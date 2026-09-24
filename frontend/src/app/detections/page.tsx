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

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            Detection content
          </h1>
          <p className="text-xs font-mono text-slate-500">
            Every detection, its versions, what each needs to run, and what it has matched.
          </p>
        </div>
        <Button variant="ghost" onClick={() => void load()}>
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs font-mono">
          {error}
        </div>
      )}

      {definitions.length === 0 ? (
        <Card variant="cyber" className="p-6">
          <p className="text-sm text-amber-300">No detections are registered.</p>
          <p className="text-xs font-mono text-slate-400 mt-1">
            Nothing will ever match. Detection definitions are published at
            service boot; if this list is empty, no rule is running.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {definitions.map((definition) => {
            const versions = [...(definition.versions ?? [])].sort(
              (a, b) => b.version - a.version,
            );
            const published = versions.filter((v) => v.status === "PUBLISHED");
            return (
              <Card key={definition.id} variant="cyber" className="p-4">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-100">
                      {definition.name}
                    </h2>
                    <p className="text-xs font-mono text-slate-500">{definition.key}</p>
                    {definition.description && (
                      <p className="text-xs text-slate-400 mt-1">{definition.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {definition.category && (
                      <Badge variant="neutral">{definition.category}</Badge>
                    )}
                    {published.length === 0 && (
                      // A definition with no published version is inert. The
                      // registry only returns PUBLISHED versions, so this one
                      // cannot fire no matter what arrives.
                      <Badge variant="fail">NO PUBLISHED VERSION</Badge>
                    )}
                  </div>
                </div>

                {versions.length === 0 ? (
                  <p className="text-xs font-mono text-amber-300">
                    No versions exist for this definition.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {versions.map((version) => (
                      <div
                        key={version.id}
                        className="border border-slate-800 rounded-lg p-3"
                      >
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-slate-300">
                              v{version.version}
                            </span>
                            <Badge
                              variant={version.status === "PUBLISHED" ? "pass" : "pending"}
                            >
                              {version.status}
                            </Badge>
                            <Badge variant={severityVariant(version.severity)}>
                              {version.severity}
                            </Badge>
                            <span className="text-xs font-mono text-slate-500">
                              {version.rule_type}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-slate-400">
                              {matchCount(version.id)} match
                              {matchCount(version.id) === 1 ? "" : "es"}
                            </span>
                            {version.status !== "PUBLISHED" && (
                              <Button
                                variant="secondary"
                                size="sm"
                                isLoading={publishing === version.id}
                                onClick={() => void publish(version.id)}
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>Publish</span>
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                          <div>
                            <span className="text-slate-500">event types: </span>
                            <span className="text-slate-300">
                              {parseList(version.required_event_types).join(", ") || "any"}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">required fields: </span>
                            <span className="text-slate-300">
                              {parseList(version.required_fields).join(", ") || "none"}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">required context: </span>
                            <span className="text-slate-300">
                              {parseList(version.required_context).join(", ") || "none"}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">missing data: </span>
                            <span className="text-slate-300">
                              {version.allowed_missing_data_behavior}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs font-mono text-slate-500 mt-2">
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
