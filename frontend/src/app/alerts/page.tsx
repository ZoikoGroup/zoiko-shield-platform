"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { useEventStream } from "@/lib/use-event-stream";
import { formatTimestamp } from "@/lib/utils";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import {
  ShieldAlert,
  FolderPlus,
  ArrowRight,
  Sparkles,
  Layers,
  Search,
  RefreshCw,
  Radio,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  LoadingState,
  PartialState,
  StaleState,
  DegradedState,
  UnavailableState,
} from "@/components/states/mandatory-ui-states";

export default function AlertsPage() {
  const router = useRouter();
  const [state] = useDemoState();
  const [isPromoting, setIsPromoting] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStale, setIsStale] = useState(false);

  const refreshAlerts = useCallback(async () => {
    setIsLoading(true);
    try {
      await ZoikoShieldApiClient.getAlerts();
      setIsStale(false);
    } catch {
      setIsStale(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Real-time Event Stream (SSE) Integration
  const { isConnected, isDegraded, lastEvent } = useEventStream({
    tenantId: state.session?.tenantId || "tenant-bank-01",
    onEvent: (event) => {
      if (event.type === "ALERT_CREATED") {
        refreshAlerts();
      }
    },
  });

  // Fetch live alerts on initial mount
  useEffect(() => {
    refreshAlerts();
  }, [refreshAlerts]);

  const handlePromote = async (alertId: string, alertTitle: string) => {
    setIsPromoting(alertId);
    try {
      const newCase = await ZoikoShieldApiClient.promoteAlertToCase(
        alertId,
        `Incident Investigation: ${alertTitle}`,
      );
      router.push(`/cases/${newCase.id}`);
    } catch (err) {
      console.error("Promote Alert Error:", err);
    } finally {
      setIsPromoting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="critical">ERB-01 STEP 6</Badge>
            <span className="text-xs font-mono text-cyan-400 font-bold">
              DETECTION &amp; ALERT TRIAGE
            </span>
            {isConnected ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950/60 border border-emerald-500/40 text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <Wifi className="w-3 h-3" /> SSE LIVE
              </span>
            ) : isDegraded ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-950/60 border border-amber-500/40 text-amber-300">
                <WifiOff className="w-3 h-3" /> POLLING DEGRADED
              </span>
            ) : null}
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            Security Alerts Queue
          </h1>
          <p className="text-sm text-slate-400">
            Rule-based and anomaly detections correlated across normalized telemetry feeds.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => router.push("/ingestion")}>
            <span>Simulate More Alerts</span>
          </Button>
          {state.cases[0] && (
            <Button
              variant="cyan"
              onClick={() => router.push(`/cases/${state.cases[0].id}`)}
            >
              <span>View Active Case</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Mandatory UI States Integration */}
      {isLoading && (
        <LoadingState
          title="Loading Security Alerts..."
          message="Fetching normalized anomaly detections from regional ingestion cell."
          regionalCell="us-east-1"
        />
      )}

      {isStale && !isLoading && (
        <StaleState
          title="Cached Alerts View"
          message="Showing last verified detections from local state cache."
          retryAction={refreshAlerts}
        />
      )}

      {state.connectors.some((c) => c.status === "DISABLED") && (
        <PartialState
          title="Partial Telemetry Ingestion Active"
          message="Some security connectors are disabled or offline. Detections may be incomplete."
          connectorsActive={state.connectors.filter((c) => c.status === "ACTIVE").length}
          connectorsTotal={state.connectors.length}
          retryAction={refreshAlerts}
        />
      )}

      {/* Alerts List */}
      <div className="space-y-3">
        {state.alerts.length === 0 && !isLoading ? (
          <UnavailableState
            title="No Active Alerts in Queue"
            message="No active threat detections in queue. Ingest security feeds to trigger detections."
            retryAction={() => router.push("/ingestion")}
          />
        ) : (
          state.alerts.map((alert, idx) => (
            <Card
              key={alert.id || idx}
              variant="cyber"
              className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5"
            >
              <div className="space-y-2 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      alert.severity === "CRITICAL"
                        ? "critical"
                        : alert.severity === "HIGH"
                        ? "high"
                        : "medium"
                    }
                  >
                    {alert.priority} • {alert.severity}
                  </Badge>
                  <h3 className="font-semibold text-sm text-slate-100 font-sans">
                    {alert.title}
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 font-mono">
                  <span>Rule: {alert.ruleName || alert.detectionRuleId}</span>
                  <span>•</span>
                  <span>Source: {alert.sourceConnector || "Generic Webhook Gateway"}</span>
                  <span>•</span>
                  <span>Target: {alert.affectedIdentities.join(", ")}</span>
                  <span>•</span>
                  <span>Assignee: {alert.assignee || "sarah.chen@acme.com"}</span>
                  <span>•</span>
                  <span>Detected: {formatTimestamp(alert.createdAt)}</span>
                </div>

                {alert.mitreTechnique && (
                  <div className="pt-1">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-purple-950/50 border border-purple-500/30 text-purple-300">
                      MITRE ATT&amp;CK: {alert.mitreTechnique}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 self-end md:self-center">
                {alert.status === "CASE_CREATED" ? (
                  <Badge variant="pass">CASE PROMOTED</Badge>
                ) : (
                  <>
                    <Badge variant={alert.status === "NEW" ? "pending" : "pass"}>
                      {alert.status}
                    </Badge>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handlePromote(alert.id, alert.title)}
                      isLoading={isPromoting === alert.id}
                    >
                      <FolderPlus className="w-4 h-4" />
                      <span>Promote to Case (shield-ingest :3002)</span>
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
