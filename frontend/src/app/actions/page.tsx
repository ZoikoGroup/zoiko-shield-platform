"use client";

import React, { useState } from "react";
import { useDemoState } from "@/lib/demo-state";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import {
  Lock,
  Unlock,
  AlertOctagon,
  RotateCcw,
  ShieldAlert,
  Server,
  FileCheck2,
  CheckCircle2,
  Cpu,
  Flame,
  Key,
} from "lucide-react";

export default function ActionsAndFreezePage() {
  const [state] = useDemoState();
  const [freezeScope, setFreezeScope] = useState<"GLOBAL" | "TENANT" | "ACTION_TYPE" | "CONNECTOR">("TENANT");
  const [freezeReason, setFreezeReason] = useState("Suspected compromised lateral credentials under investigation");
  const [isFrozen, setIsFrozen] = useState(false);
  const [activeFreezeId, setActiveFreezeId] = useState<string | null>(null);

  const [rollbackToken, setRollbackToken] = useState("rb-tok-8f7a9c2b-e102-4b71-9f1c-7e8293740192");
  const [rollbackSuccess, setRollbackSuccess] = useState(false);

  const handleToggleFreeze = () => {
    if (isFrozen) {
      setIsFrozen(false);
      setActiveFreezeId(null);
    } else {
      setIsFrozen(true);
      setActiveFreezeId(`frz-${Math.random().toString(36).substring(2, 10)}`);
    }
  };

  const handleExecuteRollback = () => {
    setRollbackSuccess(true);
    setTimeout(() => {
      setRollbackSuccess(false);
    }, 4000);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-[#0e121b] border border-amber-500/30 shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <AlertOctagon className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-white tracking-wide">
                    Governed SOAR Response & Emergency Freeze Console
                  </h1>
                  <Badge variant={isFrozen ? "critical" : "healthy"}>
                    {isFrozen ? "LOCKDOWN ACTIVE" : "OPERATIONAL"}
                  </Badge>
                  <Badge variant="neutral">R0–R4 Authority Tiers</Badge>
                </div>
                <p className="text-xs text-slate-400">
                  Specification: <span className="font-mono text-cyan-400">ZS-ENG-DRS-001</span> & <span className="font-mono text-cyan-400">ZS-ENG-EVID-001</span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300">
              Authority Engine: <span className="text-amber-400 font-bold">Dual-Custody Enabled</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Emergency Freeze Controller */}
        <div className="space-y-6">
          <Card className="p-5 space-y-4 border-amber-500/30">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                <AlertOctagon className="w-4 h-4 text-rose-500" />
                <span>Emergency SOAR Kill-Switch</span>
              </div>
              <Badge variant={isFrozen ? "critical" : "neutral"}>
                {isFrozen ? "ENGAGED" : "ARMED"}
              </Badge>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="space-y-1.5">
                <label className="text-slate-400">Freeze Scope:</label>
                <select
                  value={freezeScope}
                  onChange={(e) => setFreezeScope(e.target.value as any)}
                  disabled={isFrozen}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="TENANT">TENANT (Lockdown Current Org Only)</option>
                  <option value="GLOBAL">GLOBAL (Platform-Wide Sovereign Freeze)</option>
                  <option value="ACTION_TYPE">ACTION_TYPE (Freeze Specific Action e.g. IAM Revoke)</option>
                  <option value="CONNECTOR">CONNECTOR (Freeze Ingestion Connector)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-400">Reason / Incident Identifier:</label>
                <textarea
                  value={freezeReason}
                  onChange={(e) => setFreezeReason(e.target.value)}
                  disabled={isFrozen}
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <Button
                variant="primary"
                onClick={handleToggleFreeze}
                className={`w-full py-2.5 font-bold flex items-center justify-center gap-2 ${
                  isFrozen
                    ? "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/40 animate-pulse"
                    : "bg-amber-600 hover:bg-amber-500 text-slate-950 font-extrabold shadow-lg shadow-amber-900/30"
                }`}
              >
                {isFrozen ? (
                  <>
                    <Unlock className="w-4 h-4" />
                    <span>Release Emergency Freeze</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Engage Emergency Freeze</span>
                  </>
                )}
              </Button>

              {isFrozen && activeFreezeId && (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-[11px] text-rose-300 space-y-1">
                  <div>🚨 <strong className="text-white">Active Freeze ID:</strong> {activeFreezeId}</div>
                  <div>Scope: {freezeScope} | Locked by: sec-ops@enterprise.corp</div>
                  <div className="text-slate-400 text-[10px]">All automated SOAR mutations blocked with zero bypass.</div>
                </div>
              )}
            </div>
          </Card>

          {/* Rollback Redemption */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <RotateCcw className="w-4 h-4 text-cyan-400" />
                <span>Single-Use Rollback Redemption</span>
              </div>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="space-y-1.5">
                <label className="text-slate-400">Cryptographic Rollback Token:</label>
                <input
                  type="text"
                  value={rollbackToken}
                  onChange={(e) => setRollbackToken(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-cyan-300 font-bold focus:outline-none focus:border-cyan-500"
                />
              </div>

              <Button
                variant="outline"
                className="w-full py-2 flex items-center justify-center gap-2 border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/10"
                onClick={handleExecuteRollback}
              >
                <RotateCcw className="w-4 h-4" />
                <span>Redeem & Execute Rollback</span>
              </Button>

              {rollbackSuccess && (
                <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-[11px] text-emerald-300 space-y-1 animate-fadeIn">
                  <div className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Compensating Action Dispatched!</span>
                  </div>
                  <div>Executed: <strong className="text-white">UNISOLATE_ENDPOINT</strong> on srv-db-prod-02</div>
                  <div className="text-slate-400 text-[10px]">Rollback token invalidated immediately after use.</div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right 2 Columns: Live Pre-Execution Simulation Receipts */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-cyan-400" />
                <h2 className="text-sm font-bold text-slate-100">
                  Pre-Execution Dry-Run Simulation Receipts & Receipts Ledger
                </h2>
              </div>
              <Badge variant="anchored">Cryptographically Signed</Badge>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                      RECEIPT #rcpt-f2092389-00c4
                    </span>
                    <span className="text-slate-300 font-bold">EDR Host Containment</span>
                  </div>
                  <Badge variant="healthy">SIMULATED & SIGNED</Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                  <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                    <span className="text-slate-400 font-bold">Action Type:</span>
                    <div className="text-rose-400 font-bold mt-0.5">ISOLATE_ENDPOINT</div>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                    <span className="text-slate-400 font-bold">Target Host:</span>
                    <div className="text-amber-300 font-bold mt-0.5">srv-db-prod-02</div>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                    <span className="text-slate-400 font-bold">Authority Tier:</span>
                    <div className="text-purple-400 font-bold mt-0.5">R2 (Containment)</div>
                  </div>
                </div>

                {/* State Delta & Blast Radius */}
                <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800 space-y-2 text-[11px]">
                  <div className="text-cyan-400 font-bold">PREDICTED INFRASTRUCTURE STATE DELTA:</div>
                  <pre className="text-[10px] text-slate-300 overflow-x-auto leading-relaxed">
{`{
  "targetHost": "srv-db-prod-02",
  "expectedState": "NETWORK_ISOLATED",
  "blastRadius": {
    "affectedWorkstations": 0,
    "affectedServers": 1,
    "activeConnectionsDropped": 4,
    "serviceImpact": "LOW (Database replica failover automatic)"
  },
  "compensatingAction": "UNISOLATE_ENDPOINT",
  "rollbackTokenHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}`}
                  </pre>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
