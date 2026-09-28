"use client";

import React, { useState } from "react";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import {
  ShieldAlert,
  Terminal,
  Server,
  User,
  Globe,
  Lock,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Radio,
  FileCode2,
} from "lucide-react";
import { Case, EvidenceRecord } from "@/lib/types";

interface AttackGraphVisualizerProps {
  currentCase: Case;
  onSimulateContainment?: () => void;
}

interface AttackNode {
  id: string;
  label: string;
  sublabel: string;
  type: "adversary" | "target_identity" | "asset" | "ttp" | "merkle_leaf" | "containment";
  status: "compromised" | "targeted" | "active" | "sealed" | "contained";
  details: {
    ipOrHost?: string;
    technique?: string;
    hash?: string;
    epoch?: number;
    blastRadius?: string;
    description: string;
  };
  x: number;
  y: number;
}

export function AttackGraphVisualizer({
  currentCase,
  onSimulateContainment,
}: AttackGraphVisualizerProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string>("node-adversary");

  const nodes: AttackNode[] = [
    {
      id: "node-adversary",
      label: "Threat Ingress",
      sublabel: "198.51.100.42 (Tor Exit / Proxy)",
      type: "adversary",
      status: "active",
      details: {
        ipOrHost: "198.51.100.42",
        technique: "T1110.001 - Password Spraying",
        description:
          "High-frequency credential stuffing burst detected. 5 authentication failures in under 60 seconds targeting multi-factor auth gateway.",
      },
      x: 10,
      y: 50,
    },
    {
      id: "node-ttp",
      label: "MITRE ATT&CK TTP",
      sublabel: "T1110 (Brute Force) & T1078",
      type: "ttp",
      status: "active",
      details: {
        technique: "T1110.001 / T1078.004",
        description:
          "Adversary attempted dictionary brute force against privileged cloud accounts before attempting lateral session hijacking.",
      },
      x: 32,
      y: 20,
    },
    {
      id: "node-identity",
      label: "Targeted Identity",
      sublabel: "victim.engineer@acme.com",
      type: "target_identity",
      status: "targeted",
      details: {
        ipOrHost: "victim.engineer@acme.com",
        description:
          "Privileged engineer identity targeted with credential stuffing. 3 active OAuth session tokens scheduled for immediate revocation.",
      },
      x: 32,
      y: 80,
    },
    {
      id: "node-asset",
      label: "Target Gateway",
      sublabel: "auth-gateway-us-east-1",
      type: "asset",
      status: "compromised",
      details: {
        ipOrHost: "auth-gateway-us-east-1.internal",
        description:
          "Internal ingress proxy that surfaced repeated 401 Unauthorized bursts. Protected by zero-trust dynamic rate limiter.",
      },
      x: 60,
      y: 50,
    },
    {
      id: "node-merkle",
      label: "Merkle Evidence Leaf",
      sublabel: "Leaf #1042 (Sealed 0x00)",
      type: "merkle_leaf",
      status: "sealed",
      details: {
        hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        epoch: 1042,
        description:
          "Raw JSON payload and network headers permanently hashed with domain prefix 0x00 and dual-signed with NIST ECDSA P-256 + FIPS 204 ML-DSA-65.",
      },
      x: 85,
      y: 25,
    },
    {
      id: "node-containment",
      label: "SOAR Containment",
      sublabel: "R1 Revoke & IP Perimeter Block",
      type: "containment",
      status: currentCase.simulationReceipt ? "contained" : "targeted",
      details: {
        blastRadius: "0.05 (Zero Collateral Impact)",
        description:
          "Synthetic containment simulation verified zero downtime risk. Revokes active JWT sessions and pushes dynamic drop rule to WAF edge.",
      },
      x: 85,
      y: 75,
    },
  ];

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];

  const getNodeIcon = (type: AttackNode["type"]) => {
    switch (type) {
      case "adversary":
        return <Globe className="w-5 h-5 text-rose-400" />;
      case "ttp":
        return <Radio className="w-5 h-5 text-amber-400" />;
      case "target_identity":
        return <User className="w-5 h-5 text-cyan-400" />;
      case "asset":
        return <Server className="w-5 h-5 text-purple-400" />;
      case "merkle_leaf":
        return <Lock className="w-5 h-5 text-emerald-400" />;
      case "containment":
        return <ShieldAlert className="w-5 h-5 text-blue-400" />;
    }
  };

  const getNodeBorder = (node: AttackNode) => {
    if (selectedNodeId === node.id) {
      return "border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.4)] ring-2 ring-cyan-400/50";
    }
    switch (node.type) {
      case "adversary":
        return "border-rose-500/50 hover:border-rose-400";
      case "ttp":
        return "border-amber-500/50 hover:border-amber-400";
      case "target_identity":
        return "border-cyan-500/50 hover:border-cyan-400";
      case "asset":
        return "border-purple-500/50 hover:border-purple-400";
      case "merkle_leaf":
        return "border-emerald-500/50 hover:border-emerald-400";
      case "containment":
        return "border-blue-500/50 hover:border-blue-400";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-xl bg-slate-900/80 border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Radio className="w-4 h-4 animate-pulse" />
            </span>
            <h2 className="text-base font-bold text-slate-100">
              MITRE ATT&CK &amp; Lateral Movement Graph Visualizer
            </h2>
            <Badge variant="ai">GRAPH ENGINE v2</Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time topology mapping of ingress threats, targeted identities, gateway assets, and cryptographic Merkle provenance.
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300">
            Nodes: <strong className="text-cyan-400">{nodes.length}</strong>
          </span>
          <span className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300">
            Status: <strong className="text-emerald-400">GRAPH SEALED</strong>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Interactive Canvas */}
        <div className="lg:col-span-2 relative min-h-[460px] p-6 rounded-2xl bg-[#080c14] border border-slate-800/80 shadow-2xl overflow-hidden flex flex-col justify-between">
          {/* Subtle Cyber Grid Background */}
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(#38bdf8 1px, transparent 1px), radial-gradient(#6366f1 1px, transparent 1px)",
              backgroundSize: "24px 24px",
              backgroundPosition: "0 0, 12px 12px",
            }}
          />

          {/* SVG Connection Lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
            <defs>
              <linearGradient id="grad-attack" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.8" />
              </linearGradient>
              <linearGradient id="grad-merkle" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#a855f7" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            {/* Line 1: Adversary -> TTP */}
            <path
              d="M 18% 50% C 25% 50%, 25% 25%, 32% 25%"
              fill="none"
              stroke="url(#grad-attack)"
              strokeWidth="2"
              strokeDasharray="4 4"
              className="animate-pulse"
            />
            {/* Line 2: Adversary -> Identity */}
            <path
              d="M 18% 50% C 25% 50%, 25% 75%, 32% 75%"
              fill="none"
              stroke="url(#grad-attack)"
              strokeWidth="2"
              strokeDasharray="4 4"
              className="animate-pulse"
            />
            {/* Line 3: Identity -> Asset */}
            <path
              d="M 45% 75% C 52% 75%, 52% 50%, 60% 50%"
              fill="none"
              stroke="#06b6d4"
              strokeWidth="2"
              strokeOpacity="0.6"
            />
            {/* Line 4: TTP -> Asset */}
            <path
              d="M 45% 25% C 52% 25%, 52% 50%, 60% 50%"
              fill="none"
              stroke="#a855f7"
              strokeWidth="2"
              strokeOpacity="0.6"
            />
            {/* Line 5: Asset -> Merkle */}
            <path
              d="M 72% 50% C 78% 50%, 78% 30%, 85% 30%"
              fill="none"
              stroke="url(#grad-merkle)"
              strokeWidth="2"
              strokeOpacity="0.8"
            />
            {/* Line 6: Asset -> Containment */}
            <path
              d="M 72% 50% C 78% 50%, 78% 70%, 85% 70%"
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeOpacity="0.8"
            />
          </svg>

          {/* Node Grid Layout */}
          <div className="relative z-10 grid grid-cols-3 gap-6 h-full items-center">
            {/* Column 1: Ingress */}
            <div className="flex flex-col items-start justify-center">
              {nodes
                .filter((n) => n.id === "node-adversary")
                .map((node) => (
                  <button
                    key={node.id}
                    onClick={() => setSelectedNodeId(node.id)}
                    className={`w-full p-4 rounded-xl bg-slate-950/90 backdrop-blur border ${getNodeBorder(
                      node
                    )} transition-all text-left space-y-2 group cursor-pointer`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30">
                        {getNodeIcon(node.type)}
                      </div>
                      <Badge variant="critical">ATTACKER</Badge>
                    </div>
                    <div>
                      <div className="font-bold text-slate-100 text-xs group-hover:text-cyan-300 transition-colors">
                        {node.label}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 truncate">
                        {node.sublabel}
                      </div>
                    </div>
                  </button>
                ))}
            </div>

            {/* Column 2: TTP & Target Identity */}
            <div className="flex flex-col justify-between gap-8">
              {nodes
                .filter((n) => n.id === "node-ttp" || n.id === "node-identity")
                .map((node) => (
                  <button
                    key={node.id}
                    onClick={() => setSelectedNodeId(node.id)}
                    className={`w-full p-4 rounded-xl bg-slate-950/90 backdrop-blur border ${getNodeBorder(
                      node
                    )} transition-all text-left space-y-2 group cursor-pointer`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                        {getNodeIcon(node.type)}
                      </div>
                      <Badge variant={node.type === "ttp" ? "medium" : "high"}>
                        {node.type === "ttp" ? "MITRE TTP" : "IDENTITY"}
                      </Badge>
                    </div>
                    <div>
                      <div className="font-bold text-slate-100 text-xs group-hover:text-cyan-300 transition-colors">
                        {node.label}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 truncate">
                        {node.sublabel}
                      </div>
                    </div>
                  </button>
                ))}
            </div>

            {/* Column 3: Evidence Anchor & Containment */}
            <div className="flex flex-col justify-between gap-8">
              {nodes
                .filter((n) => n.id === "node-merkle" || n.id === "node-containment")
                .map((node) => (
                  <button
                    key={node.id}
                    onClick={() => setSelectedNodeId(node.id)}
                    className={`w-full p-4 rounded-xl bg-slate-950/90 backdrop-blur border ${getNodeBorder(
                      node
                    )} transition-all text-left space-y-2 group cursor-pointer`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                        {getNodeIcon(node.type)}
                      </div>
                      <Badge variant={node.type === "merkle_leaf" ? "pass" : "simulated"}>
                        {node.type === "merkle_leaf" ? "MERKLE SEAL" : "SOAR"}
                      </Badge>
                    </div>
                    <div>
                      <div className="font-bold text-slate-100 text-xs group-hover:text-cyan-300 transition-colors">
                        {node.label}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 truncate">
                        {node.sublabel}
                      </div>
                    </div>
                  </button>
                ))}
            </div>
          </div>

          {/* Bottom Interactive Legend */}
          <div className="relative z-10 pt-4 mt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-slate-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" /> Adversary Source
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" /> Identity Target
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> Merkle Leaf
              </span>
            </div>
            <span className="text-slate-500">Click any node to inspect telemetry envelope</span>
          </div>
        </div>

        {/* Selected Node Details Drawer */}
        <Card className="p-5 space-y-4 font-mono text-xs flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                  {getNodeIcon(selectedNode.type)}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">{selectedNode.label}</h3>
                  <span className="text-[10px] text-slate-500">{selectedNode.id}</span>
                </div>
              </div>
              <Badge variant="ai">{selectedNode.status.toUpperCase()}</Badge>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-500 text-[10px] block">NODE DESCRIPTION:</span>
                <p className="text-slate-300 text-xs font-sans leading-relaxed">
                  {selectedNode.details.description}
                </p>
              </div>

              {selectedNode.details.technique && (
                <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-slate-500 text-[10px] block">MITRE TACTIC / TECHNIQUE:</span>
                  <span className="text-amber-400 font-bold text-[11px]">
                    {selectedNode.details.technique}
                  </span>
                </div>
              )}

              {selectedNode.details.ipOrHost && (
                <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-slate-500 text-[10px] block">TARGET ENTITY:</span>
                  <span className="text-cyan-300 font-bold text-[11px]">
                    {selectedNode.details.ipOrHost}
                  </span>
                </div>
              )}

              {selectedNode.details.hash && (
                <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-slate-500 text-[10px] block">
                    CRYPTOGRAPHIC LEAF SHA-256 (0x00 || Leaf):
                  </span>
                  <span className="text-emerald-400 font-bold text-[10px] break-all">
                    {selectedNode.details.hash}
                  </span>
                  <div className="text-[10px] text-slate-500 pt-1">
                    Epoch Checkpoint: #{selectedNode.details.epoch} (Sealed)
                  </div>
                </div>
              )}

              {selectedNode.details.blastRadius && (
                <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-slate-500 text-[10px] block">
                    CONTAINMENT BLAST RADIUS SCORE:
                  </span>
                  <span className="text-cyan-400 font-bold text-[11px]">
                    {selectedNode.details.blastRadius}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 space-y-2">
            {selectedNode.type === "containment" ? (
              <Button
                variant="cyan"
                className="w-full py-2.5 flex items-center justify-center gap-2 font-bold"
                onClick={onSimulateContainment}
              >
                <Sparkles className="w-4 h-4" />
                <span>Simulate Blast Radius Containment</span>
              </Button>
            ) : (
              <div className="p-2.5 rounded bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Attested by ZoikoShield Tier-A Ingress Engine</span>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
