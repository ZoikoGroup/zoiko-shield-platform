"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { useEventStream } from "@/lib/use-event-stream";
import { formatTimestamp, cn } from "@/lib/utils";
import { Case } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  FolderLock,
  Plus,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Wifi,
  WifiOff,
  Clock,
  Lock,
  AlertTriangle,
  FileText,
  Search,
  Filter,
  Users,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import {
  LoadingState,
  StaleState,
  UnavailableState,
  PartialState,
} from "@/components/states/mandatory-ui-states";

export default function CasesListPage() {
  const router = useRouter();
  const [state] = useDemoState();
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [filterMode, setFilterMode] = useState<"all" | "mine" | "critical" | "unassigned">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "evidence" | "timeline" | "response" | "notes">("overview");
  const [isLoading, setIsLoading] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCaseTitle, setNewCaseTitle] = useState("");
  const [newCaseSeverity, setNewCaseSeverity] = useState<"CRITICAL" | "HIGH" | "MEDIUM" | "LOW">("HIGH");
  const [newCaseAssignee, setNewCaseAssignee] = useState("Sarah Chen");
  const [newCaseDesc, setNewCaseDesc] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [caseBanner, setCaseBanner] = useState<string | null>(null);

  const refreshCases = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await ZoikoShieldApiClient.getCases();
      setCases(data);
      if (data.length > 0 && !selectedCaseId) {
        setSelectedCaseId(data[0].id);
      }
      setIsStale(false);
    } catch {
      setIsStale(true);
      if (state.cases?.length > 0 && !selectedCaseId) {
        setSelectedCaseId(state.cases[0].id);
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedCaseId, state.cases]);

  // SSE Stream
  const { isConnected, isDegraded } = useEventStream({
    tenantId: state.session?.tenantId || "tenant-bank-01",
    onEvent: (event) => {
      if (event.type === "CASE_UPDATED" || event.type === "ALERT_CREATED") {
        refreshCases();
      }
    },
  });

  useEffect(() => {
    refreshCases();
  }, [refreshCases]);

  const displayCases = cases.length > 0 ? cases : state.cases || [];

  useEffect(() => {
    if (displayCases.length > 0 && !selectedCaseId) {
      setSelectedCaseId(displayCases[0].id);
    }
  }, [displayCases, selectedCaseId]);

  const activeCase = displayCases.find((c) => c.id === selectedCaseId) || displayCases[0];

  const filteredCases = useMemo(() => {
    return displayCases.filter((c) => {
      if (searchQuery && !c.title.toLowerCase().includes(searchQuery.toLowerCase()) && !c.id.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (filterMode === "critical") return c.severity === "CRITICAL";
      const assignedUser = c.assignee || c.ownerName;
      if (filterMode === "mine") return assignedUser?.toLowerCase().includes("sarah") || assignedUser?.toLowerCase().includes("chen");
      if (filterMode === "unassigned") return !assignedUser || assignedUser === "Unassigned";
      return true;
    });
  }, [displayCases, searchQuery, filterMode]);

  // No `|| N` fallback: displayCases already resolves to demo data when the
  // API has nothing, so by this point a count of 0 is a real answer (e.g.
  // every case is closed) and must render as 0, not a fabricated number.
  const openCasesCount = displayCases.filter((c) => c.status !== "CLOSED").length;
  const criticalCasesCount = displayCases.filter((c) => c.severity === "CRITICAL").length;
  const mineCasesCount = displayCases.filter((c) => {
    const assigned = (c.assignee || c.ownerName || "").toLowerCase();
    return assigned.includes("sarah") || assigned.includes("chen") || assigned.includes("security analyst");
  }).length;

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newCaseTitle.trim();
    if (!title) {
      setCaseBanner("Validation error: Case title is required.");
      return;
    }
    try {
      const res = await fetch("/api/v1/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          severity: newCaseSeverity,
          description: newCaseDesc.trim() || "Incident workspace opened by security analyst.",
        }),
      });
      const body = await res.json();
      const created = body?.data ?? body;
      if (!res.ok || !created?.id) {
        throw new Error(body?.message || "Failed to create case");
      }
      const createdWithAssignee = { ...created, assignee: newCaseAssignee };
      setCases((prev) => [createdWithAssignee, ...(prev.length > 0 ? prev : displayCases)]);
      setSelectedCaseId(created.id);
      setNewCaseTitle("");
      setNewCaseDesc("");
      setShowCreateModal(false);
      setCaseBanner(`Case ${String(created.id).toUpperCase()} created and anchored to Evidence Ledger.`);
    } catch {
      setCaseBanner("Failed to create case via backend.");
    }
  };

  const handleUpdateCaseField = async (patch: { status?: string; assignee?: string; resolutionSummary?: string }) => {
    if (!activeCase) return;
    try {
      let updated: any = {};
      if (patch.status) {
        const toState = patch.status === "OPEN" ? "TRIAGED" : patch.status;
        const res = await fetch(`/api/v1/cases/${encodeURIComponent(activeCase.id)}/transition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toState,
            reason: patch.resolutionSummary || `Status updated to ${patch.status} by analyst`,
          }),
        });
        const body = await res.json().catch(() => ({}));
        updated = body?.data ?? body;
      } else {
        const res = await fetch(`/api/v1/cases/${encodeURIComponent(activeCase.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: activeCase.title,
            description: patch.resolutionSummary || (activeCase as any).description || activeCase.aiSummary,
          }),
        });
        const body = await res.json().catch(() => ({}));
        updated = body?.data ?? body;
      }
      setCases((prev) => {
        const base = prev.length > 0 ? prev : displayCases;
        return base.map((c) => (c.id === activeCase.id ? { ...c, ...updated, ...patch } : c));
      });
      if (patch.status) {
        setCaseBanner(`Case ${activeCase.id.slice(0, 8).toUpperCase()} status persisted: ${patch.status}`);
      } else if (patch.assignee) {
        setCaseBanner(`Case ${activeCase.id.slice(0, 8).toUpperCase()} assigned to ${patch.assignee}`);
      }
    } catch {
      setCaseBanner("Failed to persist case update.");
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCase || !noteInput.trim()) return;
    const comment = noteInput.trim();
    try {
      const res = await fetch(`/api/v1/cases/${encodeURIComponent(activeCase.id)}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: comment, classification: "INTERNAL" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || "Failed to add note");
      }
      const createdNote = body?.data ?? body;
      setCases((prev) => {
        const base = prev.length > 0 ? prev : displayCases;
        return base.map((c) =>
          c.id === activeCase.id
            ? {
                ...c,
                notes: [
                  ...(Array.isArray((c as any).notes) ? (c as any).notes : []),
                  createdNote?.content
                    ? createdNote
                    : { content: comment, author: activeCase.assignee || "Sarah Chen", createdAt: new Date().toISOString() },
                ],
              }
            : c
        );
      });
      setNoteInput("");
      setCaseBanner("Investigation note recorded and appended to case timeline.");
    } catch {
      setCaseBanner("Failed to record investigation note.");
    }
  };
  const needsAnalystReviewCount = displayCases.filter(
    (c) => c.status === "OPEN" && !c.assignee,
  ).length;
  const awaitingTriageCount = displayCases.filter(
    (c) => c.severity === "CRITICAL" && c.status === "OPEN",
  ).length;
  const pendingResponseProposalsCount = displayCases.filter(
    (c) => Boolean(c.responseProposal),
  ).length;

  return (
    <div className="space-y-6">
      {/* Top Header matching Reference: WORKSPACE 03 / Case Workspace */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-line gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono text-cyan-400 font-bold tracking-wider uppercase">
              WORKSPACE 03
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              · Incident Workspace Directory
            </span>
            {isConnected && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950/60 border border-emerald-500/40 text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <Wifi className="w-3 h-3" /> SSE LIVE
              </span>
            )}
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
            Case Workspace
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Investigate security incidents, preserve evidence, and coordinate accountable response.
          </p>
        </div>

        {/* Right Reference Pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-line text-xs font-mono text-slate-400">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>Live telemetry active · Connected to Evidence Ledger</span>
          <button
            type="button"
            onClick={() => setShowCreateModal((v) => !v)}
            className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-sans font-bold text-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Case</span>
          </button>
        </div>
      </div>

      {/* Mandatory UI States */}
      {isLoading && (
        <LoadingState
          title="Loading Incident Cases..."
          message="Querying authenticated cases bound to Evidence Ledgers."
          regionalCell="us-east-1"
        />
      )}

      {isStale && !isLoading && (
        <StaleState
          title="Cached Cases Directory"
          message="Displaying cached incident workspaces from local state store."
          retryAction={refreshCases}
        />
      )}

      {/* Top 4 KPI Cards */}
      {caseBanner && (
        <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/40 text-xs text-cyan-200 flex items-center justify-between">
          <span>{caseBanner}</span>
          <button
            type="button"
            onClick={() => setCaseBanner(null)}
            className="text-[11px] font-mono text-slate-400 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {showCreateModal && (
        <Card className="p-4 border-cyan-500/40 bg-surface space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100">Create New Incident Case</h3>
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
          <form onSubmit={handleCreateCase} className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <input
              type="text"
              placeholder="Case title (e.g., Suspicious OAuth Token Grant)"
              value={newCaseTitle}
              onChange={(e) => setNewCaseTitle(e.target.value)}
              className="md:col-span-2 px-3 py-2 rounded-lg bg-canvas border border-line text-slate-100"
            />
            <select
              aria-label="New Case Severity"
              value={newCaseSeverity}
              onChange={(e) => setNewCaseSeverity(e.target.value as any)}
              className="px-3 py-2 rounded-lg bg-canvas border border-line text-slate-100"
            >
              <option value="CRITICAL">CRITICAL (P1)</option>
              <option value="HIGH">HIGH (P2)</option>
              <option value="MEDIUM">MEDIUM (P3)</option>
              <option value="LOW">LOW (P4)</option>
            </select>
            <select
              aria-label="New Case Assignee"
              value={newCaseAssignee}
              onChange={(e) => setNewCaseAssignee(e.target.value)}
              className="px-3 py-2 rounded-lg bg-canvas border border-line text-slate-100"
            >
              <option value="Sarah Chen">Sarah Chen</option>
              <option value="Alex Kumar">Alex Kumar</option>
              <option value="Marcus Vance">Marcus Vance</option>
              <option value="Elena Rostova">Elena Rostova</option>
            </select>
            <input
              type="text"
              placeholder="Initial investigation summary & scope..."
              value={newCaseDesc}
              onChange={(e) => setNewCaseDesc(e.target.value)}
              className="md:col-span-3 px-3 py-2 rounded-lg bg-canvas border border-line text-slate-100"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition-colors"
            >
              Create &amp; Anchor Case
            </button>
          </form>
        </Card>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 space-y-1 hover:border-cyan-500/30">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>OPEN CASES</span>
            <FolderLock className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-3xl font-extrabold text-slate-100 font-mono tracking-tight">
            {openCasesCount}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">{needsAnalystReviewCount} require analyst review</div>
        </Card>

        <Card className="p-4 space-y-1 hover:border-rose-500/30">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>CRITICAL CASES</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-3xl font-extrabold text-slate-100 font-mono tracking-tight">
            {criticalCasesCount}
          </div>
          <div className="text-[11px] text-rose-400 font-mono font-medium">{awaitingTriageCount} awaiting triage</div>
        </Card>

        <Card className="p-4 space-y-1 hover:border-amber-500/30">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>SLA AT RISK</span>
            <Clock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-3xl font-extrabold text-slate-500 font-mono tracking-tight">
            &mdash;
          </div>
          <div className="text-[11px] text-slate-500 font-mono font-medium">SLA tracking not yet wired to case data</div>
        </Card>

        <Card className="p-4 space-y-1 hover:border-purple-500/30">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>RESPONSE PROPOSALS</span>
            <FileText className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-3xl font-extrabold text-slate-100 font-mono tracking-tight">
            {pendingResponseProposalsCount}
          </div>
          <div className="text-[11px] text-purple-400 font-mono font-medium">Pending human approval</div>
        </Card>
      </div>

      {/* 3-Column Layout: Case Queue (3 cols), Active Case Detail (6 cols), Case Actions (3 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Case Queue (3 cols) */}
        <div className="lg:col-span-3 space-y-3">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <h3 className="font-bold text-slate-100 text-xs">Case queue</h3>
              <span className="px-1.5 py-0.2 rounded bg-line text-[10px] font-mono text-cyan-300">
                {displayCases.length} open
              </span>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search cases..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface border border-line rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono pb-1">
              <button
                onClick={() => setFilterMode("all")}
                className={cn(
                  "px-2 py-0.5 rounded transition-all",
                  filterMode === "all" ? "bg-cyan-500 text-slate-950 font-bold" : "bg-surface text-slate-400"
                )}
              >
                All {displayCases.length}
              </button>
              <button
                onClick={() => setFilterMode("mine")}
                className={cn(
                  "px-2 py-0.5 rounded transition-all",
                  filterMode === "mine" ? "bg-cyan-500 text-slate-950 font-bold" : "bg-surface text-slate-400"
                )}
              >
                Mine {mineCasesCount}
              </button>
              <button
                onClick={() => setFilterMode("critical")}
                className={cn(
                  "px-2 py-0.5 rounded transition-all",
                  filterMode === "critical" ? "bg-cyan-500 text-slate-950 font-bold" : "bg-surface text-slate-400"
                )}
              >
                Critical {criticalCasesCount}
              </button>
            </div>

            {/* Case List Items */}
            <div className="space-y-1.5 max-h-[560px] overflow-y-auto pr-1">
              {filteredCases.map((c) => {
                const isSelected = c.id === selectedCaseId;
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCaseId(c.id)}
                    className={cn(
                      "p-3 rounded-lg border cursor-pointer transition-all space-y-1",
                      isSelected
                        ? "bg-cyan-950/30 border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                        : "bg-surface border-line hover:border-slate-700"
                    )}
                  >
                    <div className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-200">
                          {c.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span
                          className={cn(
                            "px-1.5 py-0.2 rounded text-[9px] font-bold",
                            c.severity === "CRITICAL"
                              ? "bg-rose-500/20 text-rose-300"
                              : c.severity === "HIGH"
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-blue-500/20 text-blue-300"
                          )}
                        >
                          {c.severity}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">14m ago</span>
                    </div>

                    <div className="text-xs font-semibold text-slate-200 truncate">
                      {c.title}
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1">
                      <span>Identity · Entra ID</span>
                      <span className="text-rose-400 font-bold">18m SLA</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Center Column: Active Case Detail (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          {activeCase ? (
            <Card className="p-5 space-y-4">
              {/* Active Case Header */}
              <div className="space-y-2 pb-3 border-b border-line">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-line text-cyan-300 font-mono font-bold text-xs">
                      {activeCase.id.slice(0, 10).toUpperCase()}
                    </span>
                    <Badge variant={activeCase.severity === "CRITICAL" ? "critical" : "high"}>
                      {activeCase.severity}
                    </Badge>
                    <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-mono font-bold">
                      {activeCase.status}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">
                    Updated 14 min ago
                  </span>
                </div>

                <h2 className="text-base font-bold text-slate-100">
                  {activeCase.title}
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Multiple unsuccessful sign-ins targeting privileged accounts. Compromise has not been confirmed; analyst validation is required.
                </p>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-2 border-b border-line pb-1 text-xs font-mono">
                {(["overview", "evidence", "timeline", "response", "notes"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "px-3 py-1.5 rounded-t-lg transition-colors capitalize",
                      activeTab === tab
                        ? "text-cyan-300 border-b-2 border-cyan-400 font-bold bg-surface"
                        : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-surface border border-line text-xs">
                <div>
                  <div className="text-[10px] font-mono text-slate-500 uppercase">Assigned analyst</div>
                  <div className="font-semibold text-slate-200 mt-0.5">{activeCase.assignee || "Sarah Chen"}</div>
                  <select
                    aria-label="Reassign Case Analyst"
                    value={activeCase.assignee || "Sarah Chen"}
                    onChange={(e) => handleUpdateCaseField({ assignee: e.target.value })}
                    className="mt-1 bg-canvas border border-line rounded px-1.5 py-0.5 text-[10px] text-cyan-300"
                  >
                    <option value="Sarah Chen">Sarah Chen</option>
                    <option value="Alex Kumar">Alex Kumar</option>
                    <option value="Marcus Vance">Marcus Vance</option>
                    <option value="Elena Rostova">Elena Rostova</option>
                  </select>
                  <div className="text-[10px] text-slate-400">Tenant security analyst</div>
                </div>
                <div>
                  <div className="text-[10px] font-mono text-slate-500 uppercase">Time to SLA breach</div>
                  <div className="font-bold text-rose-400 mt-0.5">18 minutes</div>
                  <div className="text-[10px] text-slate-400">Escalation approaching</div>
                </div>
                <div>
                  <div className="text-[10px] font-mono text-slate-500 uppercase">Linked evidence</div>
                  <div className="font-semibold text-cyan-300 mt-0.5">3 records</div>
                  <div className="text-[10px] text-slate-400">Verification: pending</div>
                </div>
              </div>

              {/* Investigation Summary & Lifecycle Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-surface border border-line text-xs">
                <span className="text-[10px] font-mono text-slate-400 uppercase">Persisted Case Lifecycle:</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(["OPEN", "INVESTIGATING", "CONTAINED", "RESOLVED", "CLOSED"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => handleUpdateCaseField({ status: st })}
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors",
                        activeCase.status === st
                          ? "bg-cyan-500 text-slate-950"
                          : "bg-canvas hover:bg-raised text-slate-300 border border-line"
                      )}
                    >
                      {st}
                    </button>
                  ))}
                  {activeCase.status === "CLOSED" && (
                    <button
                      type="button"
                      onClick={() => handleUpdateCaseField({ status: "INVESTIGATING", resolutionSummary: "Case reopened by analyst for follow-up." })}
                      className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    >
                      Reopen Case
                    </button>
                  )}
                </div>
              </div>

              {activeTab === "notes" && (
                <form onSubmit={handleAddNote} className="flex items-center gap-2 p-2.5 rounded-xl bg-surface border border-cyan-500/30 text-xs">
                  <input
                    type="text"
                    placeholder="Add timestamped analyst investigation note..."
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded bg-canvas border border-line text-slate-100"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold"
                  >
                    Save Note
                  </button>
                </form>
              )}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <h4 className="font-bold text-slate-200">Investigation summary</h4>
                  <Link href={`/cases/${activeCase.id}`} className="text-cyan-400 hover:text-cyan-300 font-mono text-[11px]">
                    View full case &gt;
                  </Link>
                </div>
                <div className="p-3 rounded-lg bg-surface border border-line text-xs text-slate-300 leading-relaxed">
                  Sign-in failures originated from several network sources within a short period. The pattern warrants investigation for credential attacks; findings remain provisional until source logs and account activity are reviewed.
                </div>
              </div>

              {/* Investigation Timeline */}
              <div className="space-y-2 pt-1">
                <h4 className="font-bold text-slate-200 text-xs">Investigation timeline</h4>
                <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
                  <div className="p-2 rounded bg-surface border border-line">
                    <div className="text-cyan-400 font-bold">13:28</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Failed sign-ins</div>
                  </div>
                  <div className="p-2 rounded bg-surface border border-line">
                    <div className="text-cyan-400 font-bold">13:31</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Alerts correlated</div>
                  </div>
                  <div className="p-2 rounded bg-surface border border-line">
                    <div className="text-cyan-400 font-bold">13:34</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Case opened</div>
                  </div>
                  <div className="p-2 rounded bg-surface border border-line">
                    <div className="text-emerald-400 font-bold">13:45</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Assigned to S. Chen</div>
                  </div>
                </div>
              </div>

              {/* Evidence & Provenance Table */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <h4 className="font-bold text-slate-200">Evidence &amp; provenance</h4>
                  <Link href="/ledger" className="text-cyan-400 hover:text-cyan-300 font-mono text-[11px]">
                    Open evidence ledger &gt;
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-line text-[10px] text-slate-400 uppercase">
                        <th className="py-2 px-2">RECORD</th>
                        <th className="py-2 px-2">EVIDENCE SOURCE</th>
                        <th className="py-2 px-2 text-right">INTEGRITY</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      <tr>
                        <td className="py-2 px-2 text-cyan-300">EV-301</td>
                        <td className="py-2 px-2 text-slate-300">Identity provider sign-in events</td>
                        <td className="py-2 px-2 text-right text-amber-400">Not verified</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-2 text-cyan-300">EV-302</td>
                        <td className="py-2 px-2 text-slate-300">Related authentication alerts</td>
                        <td className="py-2 px-2 text-right text-amber-400">Not verified</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-2 text-cyan-300">EV-303</td>
                        <td className="py-2 px-2 text-slate-300">Case analyst notes</td>
                        <td className="py-2 px-2 text-right text-amber-400">Not verified</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          ) : (
            <div className="py-20 text-center text-slate-500 font-mono">No case selected</div>
          )}
        </div>

        {/* Right Column: Case Actions & Related Alerts (3 cols) */}
        <div className="lg:col-span-3 space-y-4">
          {/* Case Actions Card */}
          <Card className="p-5 space-y-3">
            <div className="pb-2 border-b border-line">
              <h3 className="font-bold text-slate-100 text-sm">Case actions</h3>
              <p className="text-[11px] text-slate-400">Analyst-authorized workflows</p>
            </div>

            <div className="space-y-2">
              <Button
                variant="primary"
                size="sm"
                className="w-full justify-start text-xs font-semibold"
                onClick={() => setActiveTab("notes")}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add investigation note</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-start text-xs"
                onClick={() => router.push(`/copilot`)}
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Request cited AI summary</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-start text-xs"
                onClick={() => router.push(`/response-proposals`)}
              >
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                <span>Create response proposal</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-xs"
                onClick={() => router.push(`/cases/incidents/command`)}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Escalate case</span>
              </Button>
            </div>

            <div className="p-2.5 rounded-lg bg-surface border border-line text-[10px] text-slate-400 leading-snug">
              Human approval is mandatory. No direct AI execution. High-risk R2-R4 actions require two authorized signers.
            </div>
          </Card>

          {/* Related Alerts Card */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <h3 className="font-bold text-slate-100 text-xs">Related alerts</h3>
              <span className="px-1.5 py-0.2 rounded bg-line text-[10px] font-mono text-cyan-300">
                3 linked
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-2 rounded bg-surface border border-line space-y-1">
                <div className="flex items-center justify-between">
                  <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[9px] font-mono font-bold">CRIT</span>
                  <span className="text-[10px] font-mono text-slate-500">13:28 · Microsoft Entra</span>
                </div>
                <div className="font-semibold text-slate-200 text-[11px]">Unusual authentication volume</div>
              </div>

              <div className="p-2 rounded bg-surface border border-line space-y-1">
                <div className="flex items-center justify-between">
                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-mono font-bold">HIGH</span>
                  <span className="text-[10px] font-mono text-slate-500">13:31 · Identity detection</span>
                </div>
                <div className="font-semibold text-slate-200 text-[11px]">Privileged account targeted</div>
              </div>

              <div className="p-2 rounded bg-surface border border-line space-y-1">
                <div className="flex items-center justify-between">
                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-mono font-bold">HIGH</span>
                  <span className="text-[10px] font-mono text-slate-500">13:33 · Correlation engine</span>
                </div>
                <div className="font-semibold text-slate-200 text-[11px]">Cross-source sign-in anomaly</div>
              </div>
            </div>
          </Card>

          {/* Trust & Case Controls */}
          <Card className="p-4 space-y-2 text-xs">
            <h4 className="font-bold text-slate-200 text-[11px]">Trust &amp; case controls</h4>
            <div className="space-y-2 text-[11px]">
              <div className="flex items-start gap-2 text-slate-400">
                <Lock className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-200">Tenant-scoped case access</div>
                  <div>Permissions enforced by server policy.</div>
                </div>
              </div>
              <div className="flex items-start gap-2 text-slate-400">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-200">Evidence-first decisions</div>
                  <div>Review source records before action.</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
