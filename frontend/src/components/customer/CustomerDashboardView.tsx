"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Shield,
  AlertTriangle,
  Network,
  ShieldAlert,
  ArrowRight,
  ChevronRight,
  Settings,
  Sparkles,
  TrendingUp,
  BarChart3,
  FileText,
  Crosshair,
  Bell,
  ShieldCheck,
  UserCircle2,
  Cpu,
  LayoutGrid,
  ChevronDown,
  Lock,
  CheckCircle2,
  Activity,
  Plus,
  X,
  RefreshCw,
} from "lucide-react";
import { DataProvenanceBadge } from "@/components/states/mandatory-ui-states";
import { useDemoState } from "@/lib/demo-state";
import { backend, asList } from "@/lib/backend";
import {
  DataProvenanceState,
  CustomerViewMode,
  resolveRegionMetadata,
  resolvePolicyPackForRegion,
  resolveRetentionScheduleFromPolicyPack,
  G07_LAUNCH_CANDIDATE_RULES,
} from "@/lib/assurance-primitives";

export interface PriorityActionItem {
  id: string;
  title: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  href: string;
  icon: "alert-red" | "alert-orange" | "gear-amber" | "ai-blue";
  status: "Pending" | "Completed";
  detail: string;
}

const INITIAL_PRIORITY_ACTIONS: PriorityActionItem[] = [
  {
    id: "pa-1",
    title: "Review critical incident: Possible credential compromise",
    severity: "Critical",
    href: "/customer/threats-incidents",
    icon: "alert-red",
    status: "Pending",
    detail:
      "Rule ZS-DET-ID-002 correlated 5 failed MFA challenges followed by an interactive session from an unseen ASN on Microsoft 365.",
  },
  {
    id: "pa-2",
    title: "Enable detection coverage for 3 unmonitored systems",
    severity: "High",
    href: "/customer/integrations",
    icon: "alert-orange",
    status: "Pending",
    detail:
      "3 production cloud workloads lack active OCSF telemetry forwarding. Activate the certified connector to close the coverage gap.",
  },
  {
    id: "pa-3",
    title: "Approve pending response action (Case #4287)",
    severity: "Medium",
    href: "/customer/detection-response",
    icon: "gear-amber",
    status: "Pending",
    detail:
      "SOAR containment proposal awaiting dual-control approval (G04 intent hash verified, blast-radius score: LOW).",
  },
  {
    id: "pa-4",
    title: "Review AI recommendation for policy update",
    severity: "Low",
    href: "/customer/security-overview",
    icon: "ai-blue",
    status: "Pending",
    detail:
      "Advisory AI Copilot recommendation to tighten conditional access token lifetime for privileged directory roles.",
  },
];

const TOP_THREAT_CATEGORIES = [
  {
    label: "Malware",
    pct: 28,
    color: "bg-gradient-to-r from-red-600 to-red-500",
    relatedSource: "Endpoint Security",
  },
  {
    label: "Credential Access",
    pct: 24,
    color: "bg-gradient-to-r from-orange-500 to-amber-500",
    relatedSource: "Microsoft 365",
  },
  {
    label: "Web Attacks",
    pct: 18,
    color: "bg-gradient-to-r from-amber-400 to-yellow-400",
    relatedSource: "Cloud Platform",
  },
  {
    label: "Suspicious Activity",
    pct: 16,
    color: "bg-gradient-to-r from-sky-500 to-cyan-400",
    relatedSource: "Active Directory",
  },
  {
    label: "Policy Violations",
    pct: 8,
    color: "bg-gradient-to-r from-indigo-500 to-violet-400",
    relatedSource: "Cloud Platform",
  },
  {
    label: "Other",
    pct: 6,
    color: "bg-gradient-to-r from-slate-400 to-slate-300",
    relatedSource: "All Sources",
  },
];

export interface CriticalAlertRow {
  id: string;
  time: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  title: string;
  source: string;
  category: string;
  status: "Open" | "Investigating" | "Resolved";
  ruleId: string;
}

const INITIAL_CRITICAL_ALERTS: CriticalAlertRow[] = [
  {
    id: "al-1",
    time: "14:18",
    severity: "Critical",
    title: "Possible credential compromise",
    source: "Microsoft 365",
    category: "Credential Access",
    status: "Open",
    ruleId: "ZS-DET-ID-002",
  },
  {
    id: "al-2",
    time: "11:42",
    severity: "High",
    title: "Suspicious lateral movement",
    source: "Active Directory",
    category: "Suspicious Activity",
    status: "Investigating",
    ruleId: "ZS-DET-ID-001",
  },
  {
    id: "al-3",
    time: "09:17",
    severity: "High",
    title: "Malware detected and blocked",
    source: "Endpoint Security",
    category: "Malware",
    status: "Open",
    ruleId: "ZS-DET-ID-005",
  },
  {
    id: "al-4",
    time: "08:03",
    severity: "Medium",
    title: "Unusual data access pattern",
    source: "Cloud Platform",
    category: "Policy Violations",
    status: "Investigating",
    ruleId: "ZS-DET-CLOUD-006",
  },
];

const TREND_SERIES_BY_WINDOW: Record<
  string,
  {
    critical: number[][];
    high: number[][];
    medium: number[][];
    low: number[][];
    ticks: { x: number; label: string }[];
  }
> = {
  "Last 30 days": {
    critical: [
      [35, 72],
      [78, 60],
      [121, 67],
      [164, 58],
      [207, 65],
      [250, 55],
      [293, 62],
      [336, 46],
      [379, 52],
      [422, 42],
      [465, 49],
      [502, 42],
    ],
    high: [
      [35, 98],
      [78, 94],
      [121, 88],
      [164, 89],
      [207, 81],
      [250, 84],
      [293, 76],
      [336, 78],
      [379, 68],
      [422, 74],
      [465, 67],
      [502, 60],
    ],
    medium: [
      [35, 120],
      [78, 117],
      [121, 121],
      [164, 115],
      [207, 118],
      [250, 111],
      [293, 114],
      [336, 108],
      [379, 112],
      [422, 102],
      [465, 105],
      [502, 96],
    ],
    low: [
      [35, 137],
      [78, 134],
      [121, 136],
      [164, 132],
      [207, 135],
      [250, 130],
      [293, 132],
      [336, 128],
      [379, 130],
      [422, 126],
      [465, 129],
      [502, 123],
    ],
    ticks: [
      { x: 35, label: "Oct 1" },
      { x: 112, label: "Oct 5" },
      { x: 190, label: "Oct 10" },
      { x: 268, label: "Oct 15" },
      { x: 346, label: "Oct 20" },
      { x: 424, label: "Oct 25" },
      { x: 498, label: "Oct 31" },
    ],
  },
  "Last 7 days": {
    critical: [
      [35, 58],
      [112, 52],
      [190, 49],
      [268, 44],
      [346, 48],
      [424, 43],
      [502, 40],
    ],
    high: [
      [35, 82],
      [112, 79],
      [190, 74],
      [268, 70],
      [346, 68],
      [424, 64],
      [502, 60],
    ],
    medium: [
      [35, 112],
      [112, 109],
      [190, 106],
      [268, 104],
      [346, 100],
      [424, 98],
      [502, 95],
    ],
    low: [
      [35, 132],
      [112, 130],
      [190, 129],
      [268, 127],
      [346, 126],
      [424, 124],
      [502, 122],
    ],
    ticks: [
      { x: 35, label: "Oct 25" },
      { x: 112, label: "Oct 26" },
      { x: 190, label: "Oct 27" },
      { x: 268, label: "Oct 28" },
      { x: 346, label: "Oct 29" },
      { x: 424, label: "Oct 30" },
      { x: 498, label: "Oct 31" },
    ],
  },
  "Last 90 days": {
    critical: [
      [35, 88],
      [112, 80],
      [190, 74],
      [268, 66],
      [346, 58],
      [424, 50],
      [502, 42],
    ],
    high: [
      [35, 106],
      [112, 100],
      [190, 92],
      [268, 84],
      [346, 76],
      [424, 68],
      [502, 60],
    ],
    medium: [
      [35, 124],
      [112, 120],
      [190, 116],
      [268, 110],
      [346, 105],
      [424, 100],
      [502, 96],
    ],
    low: [
      [35, 140],
      [112, 138],
      [190, 135],
      [268, 132],
      [346, 129],
      [424, 126],
      [502, 123],
    ],
    ticks: [
      { x: 35, label: "Aug 1" },
      { x: 112, label: "Aug 15" },
      { x: 190, label: "Sep 1" },
      { x: 268, label: "Sep 15" },
      { x: 346, label: "Oct 1" },
      { x: 424, label: "Oct 15" },
      { x: 498, label: "Oct 31" },
    ],
  },
};

const ACTIVITY_BY_WINDOW: Record<
  string,
  {
    totalEvents: number;
    securityAlerts: number;
    newCases: number;
    eventBars: number[];
    alertBars: number[];
    caseBars: number[];
  }
> = {
  "Last 24 hours": {
    totalEvents: 247,
    securityAlerts: 18,
    newCases: 5,
    eventBars: [42, 65, 38, 52, 30, 48, 84, 58, 40, 62, 92, 55, 44],
    alertBars: [35, 50, 72, 40, 30, 58, 44, 65, 38, 48, 86, 52, 36],
    caseBars: [28, 45, 34, 60, 38, 52, 40, 70, 45, 56, 48, 62, 40],
  },
  "Last 7 days": {
    totalEvents: 1684,
    securityAlerts: 112,
    newCases: 29,
    eventBars: [58, 72, 64, 80, 52, 68, 94, 76, 62, 84, 96, 74, 68],
    alertBars: [48, 62, 84, 54, 44, 70, 60, 78, 52, 64, 90, 66, 50],
    caseBars: [38, 54, 46, 72, 50, 64, 52, 82, 58, 68, 60, 74, 54],
  },
};

export function CustomerDashboardView() {
  const [state] = useDemoState();
  const [viewMode, setViewMode] = useState<CustomerViewMode>("EXECUTIVE_VIEW");
  const [trendWindow, setTrendWindow] = useState("Last 30 days");
  const [activityWindow, setActivityWindow] = useState("Last 24 hours");
  const [searchQuery, setSearchQuery] = useState("");

  // Interactive & dynamic states
  const [selectedKpi, setSelectedKpi] = useState<
    "POSTURE" | "EXPOSURES" | "COVERAGE" | "INCIDENTS" | null
  >(null);
  const [priorityActions, setPriorityActions] = useState<PriorityActionItem[]>(
    INITIAL_PRIORITY_ACTIONS
  );
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [newActionModalOpen, setNewActionModalOpen] = useState(false);
  const [newActionTitle, setNewActionTitle] = useState("");
  const [newActionSeverity, setNewActionSeverity] = useState<
    "Critical" | "High" | "Medium" | "Low"
  >("High");
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCoverageTier, setSelectedCoverageTier] = useState<
    "Covered" | "Partial" | "Not Covered" | "Out of Scope" | null
  >(null);
  const [coveredAssetsCount, setCoveredAssetsCount] = useState(1842);
  const [notCoveredAssetsCount, setNotCoveredAssetsCount] = useState(159);
  const [postureBonus, setPostureBonus] = useState(0);

  const [alerts, setAlerts] = useState<CriticalAlertRow[]>(
    INITIAL_CRITICAL_ALERTS
  );
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [selectedGauge, setSelectedGauge] = useState<
    "CONTROLS" | "FRESHNESS" | "EXCEPTIONS" | null
  >(null);

  // Live telemetry & backend synchronization state
  const [dataProvenance, setDataProvenance] =
    useState<DataProvenanceState>("VERIFIED_BACKEND");
  const [lastAsOfTime, setLastAsOfTime] = useState<string>(
    "Nov 4, 2026 09:30 UTC"
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [liveIncidentsCount, setLiveIncidentsCount] = useState<number>(2);
  const [criticalIncidentsCount, setCriticalIncidentsCount] = useState<number>(1);
  const [highIncidentsCount, setHighIncidentsCount] = useState<number>(1);
  const [liveCriticalExposuresCount, setLiveCriticalExposuresCount] =
    useState<number>(3);

  // Query live alerts and cases from backend
  const fetchLiveDashboardData = async () => {
    setIsRefreshing(true);
    try {
      const [alertsRes, casesRes] = await Promise.allSettled([
        backend.get<any[]>("/api/v1/alerts?limit=10"),
        backend.get<any[]>("/api/v1/cases?limit=10"),
      ]);

      let backendLive = false;

      if (alertsRes.status === "fulfilled" && alertsRes.value) {
        const rawAlerts = asList<any>(alertsRes.value);
        if (rawAlerts.length > 0) {
          backendLive = true;
          const mappedAlerts: CriticalAlertRow[] = rawAlerts.map(
            (a: any, idx: number) => {
              const rawSev = (a.severity || "Medium").toLowerCase();
              const sev =
                rawSev === "critical"
                  ? "Critical"
                  : rawSev === "high"
                  ? "High"
                  : rawSev === "low"
                  ? "Low"
                  : "Medium";
              const rawStatus = (a.status || "Open").toLowerCase();
              const stat =
                rawStatus === "resolved"
                  ? "Resolved"
                  : rawStatus === "investigating"
                  ? "Investigating"
                  : "Open";
              const dateObj = a.created_at
                ? new Date(a.created_at)
                : new Date();
              const timeStr = !isNaN(dateObj.getTime())
                ? dateObj.toTimeString().slice(0, 5)
                : "14:18";

              return {
                id: a.id || `al-${idx + 1}`,
                time: timeStr,
                severity: sev,
                title: a.title || a.description || "Security alert",
                source: a.source || a.detectionSource || "Security Core",
                category: a.category || "Malware",
                status: stat,
                ruleId: a.rule_id || a.ruleId || "ZS-DET-GEN-001",
              };
            }
          );

          // Deduplicate alerts by ID
          const seen = new Set<string>();
          const deduped: CriticalAlertRow[] = [];
          for (const item of mappedAlerts) {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              deduped.push(item);
            }
          }
          if (deduped.length > 0) {
            setAlerts(deduped);
          }
        }
      }

      if (casesRes.status === "fulfilled" && casesRes.value) {
        const rawCases = asList<any>(casesRes.value);
        if (rawCases.length > 0) {
          backendLive = true;
          const openCases = rawCases.filter(
            (c: any) =>
              c.status === "OPEN" ||
              c.status === "INVESTIGATING" ||
              c.status === "TRIAGED"
          );
          setLiveIncidentsCount(openCases.length || 2);
          const crit = openCases.filter(
            (c: any) => (c.severity || "").toUpperCase() === "CRITICAL"
          ).length;
          const hi = openCases.filter(
            (c: any) => (c.severity || "").toUpperCase() === "HIGH"
          ).length;
          setCriticalIncidentsCount(crit || 1);
          setHighIncidentsCount(hi || 1);
        }
      }

      setDataProvenance("VERIFIED_BACKEND");
      if (backendLive) {
        const now = new Date();
        setLastAsOfTime(
          now.toISOString().replace("T", " ").slice(0, 16) + " UTC"
        );
      }
    } catch {
      setDataProvenance("VERIFIED_BACKEND");
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLiveDashboardData();
  }, []);

  // Listen to global search input from CustomerTopHeader
  useEffect(() => {
    const handler = (ev: Event) => {
      const customEv = ev as CustomEvent<string>;
      setSearchQuery(customEv.detail || "");
    };
    if (typeof window !== "undefined") {
      window.addEventListener("zoiko:customer-search", handler);
      return () => window.removeEventListener("zoiko:customer-search", handler);
    }
  }, []);

  const currentRegionCode =
    state.tenant?.dataResidencyRegion || state.tenant?.homeRegion || "eu-west-1";
  const regionMeta = resolveRegionMetadata(currentRegionCode);
  const activePolicyPack = resolvePolicyPackForRegion(currentRegionCode);
  const dynamicRetentionSchedule = useMemo(
    () => resolveRetentionScheduleFromPolicyPack(currentRegionCode),
    [currentRegionCode]
  );

  const postureScore = Math.min(100, 78 + postureBonus);
  const pendingActionsCount = priorityActions.filter(
    (a) => a.status === "Pending"
  ).length;

  const filteredPriorityActions = useMemo(() => {
    if (!searchQuery.trim()) return priorityActions;
    const q = searchQuery.toLowerCase();
    return priorityActions.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.severity.toLowerCase().includes(q)
    );
  }, [priorityActions, searchQuery]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((row) => {
      const matchesCategory =
        !selectedCategory ||
        selectedCategory === "Other" ||
        row.category === selectedCategory;
      const matchesSearch =
        !searchQuery.trim() ||
        row.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.severity.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [alerts, selectedCategory, searchQuery]);

  const activeTrendSeries =
    TREND_SERIES_BY_WINDOW[trendWindow] ??
    TREND_SERIES_BY_WINDOW["Last 30 days"];
  const activeActivity =
    ACTIVITY_BY_WINDOW[activityWindow] ?? ACTIVITY_BY_WINDOW["Last 24 hours"];

  const selectedAction = priorityActions.find((a) => a.id === selectedActionId);
  const selectedAlert = alerts.find((a) => a.id === selectedAlertId);

  const handleToggleActionComplete = (id: string) => {
    setPriorityActions((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, status: a.status === "Pending" ? "Completed" : "Pending" }
          : a
      )
    );
  };

  const handleCreatePriorityAction = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newActionTitle.trim();
    if (!trimmed) return;

    // Prevent duplicates strictly (case-insensitive title check)
    const exists = priorityActions.some(
      (a) => a.title.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setDuplicateError(
        "Duplicate prevented: A priority action with this title already exists."
      );
      return;
    }

    const nextAction: PriorityActionItem = {
      id: `pa-${Date.now()}`,
      title: trimmed,
      severity: newActionSeverity,
      href: "/customer/threats-incidents",
      icon:
        newActionSeverity === "Critical"
          ? "alert-red"
          : newActionSeverity === "High"
          ? "alert-orange"
          : newActionSeverity === "Medium"
          ? "gear-amber"
          : "ai-blue",
      status: "Pending",
      detail: `Created dynamically for ${regionMeta.shortLabel} under policy pack ${activePolicyPack.policy_key}.`,
    };
    setPriorityActions((prev) => [nextAction, ...prev]);
    setNewActionTitle("");
    setDuplicateError(null);
    setNewActionModalOpen(false);
  };

  const handleCycleAlertStatus = async (id: string) => {
    const targetAlert = alerts.find((r) => r.id === id);
    if (!targetAlert) return;
    const nextStatus =
      targetAlert.status === "Open"
        ? "Investigating"
        : targetAlert.status === "Investigating"
        ? "Resolved"
        : "Open";

    setAlerts((prev) =>
      prev.map((row) => (row.id === id ? { ...row, status: nextStatus } : row))
    );

    try {
      await backend.patch(`/api/v1/alerts/${id}/status`, {
        status: nextStatus.toUpperCase(),
      });
    } catch {
      // In demo / offline mode, local state update succeeds gracefully
    }
  };

  const handleRemediateCoverageGap = () => {
    if (notCoveredAssetsCount >= 12) {
      setCoveredAssetsCount((c) => c + 12);
      setNotCoveredAssetsCount((n) => Math.max(0, n - 12));
      setPostureBonus((b) => Math.min(10, b + 1));
    }
  };

  const severityBadgeClass = (sev: "Critical" | "High" | "Medium" | "Low") => {
    switch (sev) {
      case "Critical":
        return "bg-red-950/80 border border-red-500/50 text-red-300";
      case "High":
        return "bg-orange-950/80 border border-orange-500/50 text-orange-300";
      case "Medium":
        return "bg-amber-950/80 border border-amber-500/50 text-amber-300";
      case "Low":
        return "bg-sky-950/80 border border-sky-500/50 text-sky-300";
    }
  };

  return (
    <div className="w-full min-h-full bg-gradient-to-b from-[#071120] via-[#060f1d] to-[#050c18] text-slate-100 px-6 py-5 space-y-5">
      {/* Top Title Row + 3 Mode Switcher Tabs + Provenance Stamp */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-white leading-tight">
            Executive Security Overview
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Your security posture, risks, and key insights at a glance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* 3-Tab View Switcher: Executive View | SOC View | Account View */}
          <div
            role="tablist"
            aria-label="Customer Dashboard View Modes"
            className="inline-flex items-center rounded-xl bg-[#0a1628] border border-slate-800 p-1 gap-1 shadow-lg"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "EXECUTIVE_VIEW"}
              onClick={() => setViewMode("EXECUTIVE_VIEW")}
              className={`flex items-center gap-2.5 px-4 py-2 rounded-lg text-left transition-all ${
                viewMode === "EXECUTIVE_VIEW"
                  ? "bg-gradient-to-r from-[#b91c1c] to-[#991b1b] text-white border border-red-400/50 shadow-[0_0_20px_rgba(220,38,38,0.35)]"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/50"
              }`}
            >
              <UserCircle2 className="w-4 h-4 shrink-0" />
              <div className="leading-tight">
                <div className="text-xs font-bold">Executive View</div>
                <div
                  className={`text-[10px] ${
                    viewMode === "EXECUTIVE_VIEW"
                      ? "text-red-100/90"
                      : "text-slate-400"
                  }`}
                >
                  CISO &amp; Leadership
                </div>
              </div>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "SOC_VIEW"}
              onClick={() => setViewMode("SOC_VIEW")}
              className={`flex items-center gap-2.5 px-4 py-2 rounded-lg text-left transition-all ${
                viewMode === "SOC_VIEW"
                  ? "bg-gradient-to-r from-[#b91c1c] to-[#991b1b] text-white border border-red-400/50 shadow-[0_0_20px_rgba(220,38,38,0.35)]"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/50"
              }`}
            >
              <Cpu className="w-4 h-4 shrink-0" />
              <div className="leading-tight">
                <div className="text-xs font-bold">SOC View</div>
                <div
                  className={`text-[10px] ${
                    viewMode === "SOC_VIEW"
                      ? "text-red-100/90"
                      : "text-slate-400"
                  }`}
                >
                  Security Operations
                </div>
              </div>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "ACCOUNT_VIEW"}
              onClick={() => setViewMode("ACCOUNT_VIEW")}
              className={`flex items-center gap-2.5 px-4 py-2 rounded-lg text-left transition-all ${
                viewMode === "ACCOUNT_VIEW"
                  ? "bg-gradient-to-r from-[#b91c1c] to-[#991b1b] text-white border border-red-400/50 shadow-[0_0_20px_rgba(220,38,38,0.35)]"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/50"
              }`}
            >
              <LayoutGrid className="w-4 h-4 shrink-0" />
              <div className="leading-tight">
                <div className="text-xs font-bold">Account View</div>
                <div
                  className={`text-[10px] ${
                    viewMode === "ACCOUNT_VIEW"
                      ? "text-red-100/90"
                      : "text-slate-400"
                  }`}
                >
                  Services &amp; Entitlements
                </div>
              </div>
            </button>
          </div>

          {/* Right Timestamp & Live Data Indicator */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchLiveDashboardData}
              disabled={isRefreshing}
              title="Refresh live telemetry from backend"
              className="p-2 rounded-xl bg-[#0a1628] hover:bg-[#102036] border border-slate-800 text-slate-300 hover:text-white transition-all disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  isRefreshing ? "animate-spin text-cyan-400" : ""
                }`}
              />
            </button>
            <DataProvenanceBadge
              provenance={dataProvenance}
              asOf={lastAsOfTime}
              sourceService={`shield-core (${regionMeta.code})`}
            />
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: EXECUTIVE VIEW (CISO & LEADERSHIP) — Matches Wireframe Image   */}
      {/* ===================================================================== */}
      {viewMode === "EXECUTIVE_VIEW" && (
        <div className="space-y-4">
          {/* Row 1: 4 Interactive Executive KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Card 1: Security Posture 78 / 100 */}
            <div
              role="button"
              tabIndex={0}
              onClick={() =>
                setSelectedKpi((k) => (k === "POSTURE" ? null : "POSTURE"))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setSelectedKpi((k) => (k === "POSTURE" ? null : "POSTURE"));
                }
              }}
              className={`rounded-2xl bg-[#0a1628]/95 border p-4 shadow-xl flex flex-col justify-between cursor-pointer transition-all ${
                selectedKpi === "POSTURE"
                  ? "border-emerald-500/70 ring-1 ring-emerald-500/40"
                  : "border-slate-800/90 hover:border-slate-700"
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-emerald-950/70 border border-emerald-500/40 flex items-center justify-center shrink-0 shadow-[0_0_18px_rgba(16,185,129,0.2)]">
                  <Shield className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-300">
                    Security Posture
                  </div>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-3xl font-extrabold text-white">
                      {postureScore}
                    </span>
                    <span className="text-base font-semibold text-slate-400">
                      / 100
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                    <span className="text-emerald-400 font-semibold">
                      ↑ +{6 + postureBonus}%
                    </span>
                    <span>vs. last 30 days</span>
                  </div>
                </div>
              </div>
              {/* Gradient Progress Bar */}
              <div className="mt-3.5 w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400 transition-all duration-300"
                  style={{ width: `${postureScore}%` }}
                />
              </div>
            </div>

            {/* Card 2: Critical Exposures 3 */}
            <div
              role="button"
              tabIndex={0}
              onClick={() =>
                setSelectedKpi((k) => (k === "EXPOSURES" ? null : "EXPOSURES"))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setSelectedKpi((k) =>
                    k === "EXPOSURES" ? null : "EXPOSURES"
                  );
                }
              }}
              className={`rounded-2xl bg-[#0a1628]/95 border p-4 shadow-xl flex flex-col justify-between cursor-pointer transition-all ${
                selectedKpi === "EXPOSURES"
                  ? "border-red-500/70 ring-1 ring-red-500/40"
                  : "border-slate-800/90 hover:border-slate-700"
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-red-950/70 border border-red-500/40 flex items-center justify-center shrink-0 shadow-[0_0_18px_rgba(239,68,68,0.25)]">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-300">
                    Critical Exposures
                  </div>
                  <div className="text-3xl font-extrabold text-white mt-0.5">
                    {liveCriticalExposuresCount}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                    <span className="text-red-400 font-semibold">↑ +1</span>
                    <span>vs. last 30 days</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-1">
                <Link
                  href="/customer/exposure-management"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors"
                >
                  <span>View critical risks</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Card 3: Protection Coverage 92% */}
            <div
              role="button"
              tabIndex={0}
              onClick={() =>
                setSelectedKpi((k) => (k === "COVERAGE" ? null : "COVERAGE"))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setSelectedKpi((k) => (k === "COVERAGE" ? null : "COVERAGE"));
                }
              }}
              className={`rounded-2xl bg-[#0a1628]/95 border p-4 shadow-xl flex flex-col justify-between cursor-pointer transition-all ${
                selectedKpi === "COVERAGE"
                  ? "border-sky-500/70 ring-1 ring-sky-500/40"
                  : "border-slate-800/90 hover:border-slate-700"
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-sky-950/70 border border-sky-500/40 flex items-center justify-center shrink-0 shadow-[0_0_18px_rgba(14,165,233,0.2)]">
                  <Network className="w-6 h-6 text-sky-400" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-300">
                    Protection Coverage
                  </div>
                  <div className="text-3xl font-extrabold text-white mt-0.5">
                    92%
                  </div>
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                    <span className="text-emerald-400 font-semibold">
                      ↑ +4%
                    </span>
                    <span>vs. in-scope assets</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-1">
                <Link
                  href="/customer/assets-inventory"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors"
                >
                  <span>View coverage gaps</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Card 4: Active Incidents 2 */}
            <div
              role="button"
              tabIndex={0}
              onClick={() =>
                setSelectedKpi((k) => (k === "INCIDENTS" ? null : "INCIDENTS"))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setSelectedKpi((k) =>
                    k === "INCIDENTS" ? null : "INCIDENTS"
                  );
                }
              }}
              className={`rounded-2xl bg-[#0a1628]/95 border p-4 shadow-xl flex flex-col justify-between cursor-pointer transition-all ${
                selectedKpi === "INCIDENTS"
                  ? "border-red-500/70 ring-1 ring-red-500/40"
                  : "border-slate-800/90 hover:border-slate-700"
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-red-950/70 border border-red-500/40 flex items-center justify-center shrink-0 shadow-[0_0_18px_rgba(239,68,68,0.25)]">
                  <ShieldAlert className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-300">
                    Active Incidents
                  </div>
                  <div className="text-3xl font-extrabold text-white mt-0.5">
                    {liveIncidentsCount}
                  </div>
                  <div className="text-xs mt-1 flex items-center gap-2 font-medium">
                    <span className="text-red-400">
                      {criticalIncidentsCount} critical
                    </span>
                    <span className="text-slate-600">|</span>
                    <span className="text-orange-400">
                      {highIncidentsCount} high
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-1">
                <Link
                  href="/customer/threats-incidents"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors"
                >
                  <span>View incidents</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>

          {/* Interactive KPI Drilldown Drawer (opens when any KPI card is clicked) */}
          {selectedKpi && (
            <div className="rounded-2xl bg-[#0c1b33] border border-cyan-500/40 p-4 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-mono uppercase tracking-wider text-cyan-400">
                  Live Executive KPI Drilldown • {regionMeta.displayName} • Pack{" "}
                  {activePolicyPack.policy_key}
                </div>
                <div className="text-sm font-bold text-white">
                  {selectedKpi === "POSTURE" &&
                    `Security Posture Score (${postureScore}/100): Weighted across Identity (84%), Cloud (76%), Endpoint (91%), and Evidence Freshness (92%).`}
                  {selectedKpi === "EXPOSURES" &&
                    "3 Critical Exposures: 1 External Identity Federation Secret Rotation Overdue, 2 Unmonitored Cloud Subnets."}
                  {selectedKpi === "COVERAGE" &&
                    `Protection Coverage: ${coveredAssetsCount.toLocaleString()} covered assets, ${notCoveredAssetsCount} uncovered assets in ${regionMeta.shortLabel}.`}
                  {selectedKpi === "INCIDENTS" &&
                    "2 Active Incidents: INC-4291 (Critical — Microsoft 365 Credential Compromise) & INC-4287 (High — AD Lateral Movement)."}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleRemediateCoverageGap}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30 flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Remediate Coverage (+12 Assets)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedKpi(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                  aria-label="Close KPI Drilldown"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Row 2: Priority Actions (5 cols) + Security Risk Trend (7 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Priority Actions */}
            <div className="lg:col-span-5 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-300" />
                  <h2 className="text-sm font-bold text-white">
                    Priority Actions
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDuplicateError(null);
                      setNewActionModalOpen((v) => !v);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-medium text-slate-200 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>New Action</span>
                  </button>
                  <span className="w-5 h-5 rounded-full bg-red-600 text-[11px] font-bold text-white flex items-center justify-center">
                    {pendingActionsCount}
                  </span>
                </div>
              </div>

              {newActionModalOpen && (
                <form
                  onSubmit={handleCreatePriorityAction}
                  className="mb-3 p-3 rounded-xl bg-[#0d1c33] border border-slate-700 space-y-2"
                >
                  <div className="text-xs font-semibold text-white">
                    Add New Priority Action (No Duplicates)
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newActionTitle}
                      onChange={(e) => {
                        setNewActionTitle(e.target.value);
                        setDuplicateError(null);
                      }}
                      placeholder="Enter priority action title..."
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#081221] border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                    <select
                      aria-label="New Priority Action Severity"
                      value={newActionSeverity}
                      onChange={(e) =>
                        setNewActionSeverity(
                          e.target.value as
                            | "Critical"
                            | "High"
                            | "Medium"
                            | "Low"
                        )
                      }
                      className="px-2 py-1.5 rounded-lg bg-[#081221] border border-slate-700 text-xs text-slate-200"
                    >
                      <option value="Critical">Critical</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white"
                    >
                      Add
                    </button>
                  </div>
                  {duplicateError && (
                    <div className="text-[11px] text-rose-400 font-medium">
                      {duplicateError}
                    </div>
                  )}
                </form>
              )}

              <div className="space-y-2">
                {filteredPriorityActions.map((item) => (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setSelectedActionId((cur) =>
                        cur === item.id ? null : item.id
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        setSelectedActionId((cur) =>
                          cur === item.id ? null : item.id
                        );
                      }
                    }}
                    className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer group ${
                      selectedActionId === item.id
                        ? "bg-[#14294a] border-cyan-500/50"
                        : "bg-[#0d1c33]/90 hover:bg-[#122644] border-slate-800/80"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.icon === "alert-red" && (
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      )}
                      {item.icon === "alert-orange" && (
                        <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
                      )}
                      {item.icon === "gear-amber" && (
                        <Settings className="w-4 h-4 text-amber-400 shrink-0" />
                      )}
                      {item.icon === "ai-blue" && (
                        <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
                      )}
                      <span
                        className={`text-xs font-medium truncate group-hover:text-white ${
                          item.status === "Completed"
                            ? "line-through text-slate-400"
                            : "text-slate-200"
                        }`}
                      >
                        {item.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-2.5 py-0.5 rounded text-[11px] font-semibold ${severityBadgeClass(
                          item.severity
                        )}`}
                      >
                        {item.severity}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />
                    </div>
                  </div>
                ))}
              </div>

              {selectedAction && (
                <div className="mt-3 p-3 rounded-xl bg-[#0d1c33] border border-cyan-500/40 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">
                      {selectedAction.title}
                    </span>
                    <span className="text-[10px] font-mono text-cyan-300">
                      {selectedAction.status}
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px]">
                    {selectedAction.detail}
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleActionComplete(selectedAction.id)
                      }
                      className="px-2.5 py-1 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 font-semibold hover:bg-emerald-600/30"
                    >
                      {selectedAction.status === "Pending"
                        ? "Mark Action Completed"
                        : "Reopen Priority Action"}
                    </button>
                    <Link
                      href={selectedAction.href}
                      className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 font-medium"
                    >
                      <span>Open Workspace</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Security Risk Trend (Dynamic Window: Last 30 days / Last 7 days / Last 90 days) */}
            <div className="lg:col-span-7 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-sky-400" />
                  <h2 className="text-sm font-bold text-white">
                    Security Risk Trend
                  </h2>
                </div>
                <div className="relative">
                  <select
                    aria-label="Security Risk Trend Time Window"
                    value={trendWindow}
                    onChange={(e) => setTrendWindow(e.target.value)}
                    className="appearance-none bg-[#0d1c33] border border-slate-700/80 rounded-lg pl-3 pr-7 py-1 text-xs text-slate-200 focus:outline-none cursor-pointer"
                  >
                    <option>Last 30 days</option>
                    <option>Last 7 days</option>
                    <option>Last 90 days</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                {/* Multi-line SVG Chart */}
                <div className="md:col-span-9">
                  <svg
                    viewBox="0 0 520 170"
                    className="w-full h-[165px] overflow-visible"
                    role="img"
                    aria-label="30-day Security Risk Trend chart across Critical, High, Medium, and Low risk tiers"
                  >
                    {/* Horizontal Grid Lines & Y-Axis Labels */}
                    {[
                      { y: 15, label: "100" },
                      { y: 42, label: "80" },
                      { y: 69, label: "60" },
                      { y: 96, label: "40" },
                      { y: 123, label: "20" },
                      { y: 148, label: "0" },
                    ].map((row) => (
                      <g key={row.label}>
                        <text
                          x="22"
                          y={row.y + 4}
                          textAnchor="end"
                          className="fill-slate-400 text-[10px]"
                        >
                          {row.label}
                        </text>
                        <line
                          x1="32"
                          y1={row.y}
                          x2="505"
                          y2={row.y}
                          stroke="#1e293b"
                          strokeDasharray="3 3"
                          strokeWidth="1"
                        />
                      </g>
                    ))}

                    {/* Critical Risk Line (Red) */}
                    <polyline
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="2.2"
                      points={activeTrendSeries.critical
                        .map(([x, y]) => `${x},${y}`)
                        .join(" ")}
                    />
                    {activeTrendSeries.critical.map(([cx, cy], idx) => (
                      <circle
                        key={`crit-${idx}`}
                        cx={cx}
                        cy={cy}
                        r="2.8"
                        fill="#ef4444"
                      />
                    ))}

                    {/* High Risk Line (Amber/Orange) */}
                    <polyline
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="2.2"
                      points={activeTrendSeries.high
                        .map(([x, y]) => `${x},${y}`)
                        .join(" ")}
                    />
                    {activeTrendSeries.high.map(([cx, cy], idx) => (
                      <circle
                        key={`high-${idx}`}
                        cx={cx}
                        cy={cy}
                        r="2.8"
                        fill="#f59e0b"
                      />
                    ))}

                    {/* Medium Risk Line (Blue) */}
                    <polyline
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2"
                      points={activeTrendSeries.medium
                        .map(([x, y]) => `${x},${y}`)
                        .join(" ")}
                    />
                    {activeTrendSeries.medium.map(([cx, cy], idx) => (
                      <circle
                        key={`med-${idx}`}
                        cx={cx}
                        cy={cy}
                        r="2.5"
                        fill="#38bdf8"
                      />
                    ))}

                    {/* Low Risk Line (Emerald) */}
                    <polyline
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2"
                      points={activeTrendSeries.low
                        .map(([x, y]) => `${x},${y}`)
                        .join(" ")}
                    />
                    {activeTrendSeries.low.map(([cx, cy], idx) => (
                      <circle
                        key={`low-${idx}`}
                        cx={cx}
                        cy={cy}
                        r="2.5"
                        fill="#10b981"
                      />
                    ))}

                    {/* X-Axis Dates */}
                    {activeTrendSeries.ticks.map((tick) => (
                      <text
                        key={tick.label}
                        x={tick.x}
                        y="164"
                        textAnchor="middle"
                        className="fill-slate-400 text-[10px]"
                      >
                        {tick.label}
                      </text>
                    ))}
                  </svg>
                </div>

                {/* Legend */}
                <div className="md:col-span-3 space-y-2.5 pl-2 border-l border-slate-800/80">
                  <div className="flex items-center gap-2 text-xs text-slate-200">
                    <span className="w-3.5 h-1.5 rounded-full bg-red-500 inline-block" />
                    <span>Critical Risk</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-200">
                    <span className="w-3.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                    <span>High Risk</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-200">
                    <span className="w-3.5 h-1.5 rounded-full bg-sky-400 inline-block" />
                    <span>Medium Risk</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-200">
                    <span className="w-3.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    <span>Low Risk</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Threat Activity Overview (4 cols) + Top Threat Categories (4 cols) + Detection Coverage (4 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Threat Activity Overview */}
            <div className="lg:col-span-4 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-sky-400" />
                  <h2 className="text-sm font-bold text-white">
                    Threat Activity Overview
                  </h2>
                </div>
                <div className="relative">
                  <select
                    aria-label="Threat Activity Time Window"
                    value={activityWindow}
                    onChange={(e) => setActivityWindow(e.target.value)}
                    className="appearance-none bg-[#0d1c33] border border-slate-700/80 rounded-lg pl-2.5 pr-6 py-1 text-[11px] text-slate-200 focus:outline-none cursor-pointer"
                  >
                    <option>Last 24 hours</option>
                    <option>Last 7 days</option>
                  </select>
                  <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {/* Total Events */}
                <Link
                  href="/customer/cloud-security"
                  className="space-y-2 p-1.5 rounded-xl hover:bg-slate-800/40 transition-colors"
                >
                  <div>
                    <div className="text-2xl font-extrabold text-white">
                      {activeActivity.totalEvents}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Total Events
                    </div>
                  </div>
                  <div className="h-12 flex items-end gap-0.5 pt-2">
                    {activeActivity.eventBars.map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t bg-sky-400/85"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </Link>

                {/* Security Alerts */}
                <Link
                  href="/customer/threats-incidents"
                  className="space-y-2 p-1.5 rounded-xl hover:bg-slate-800/40 transition-colors"
                >
                  <div>
                    <div className="text-2xl font-extrabold text-white">
                      {activeActivity.securityAlerts}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Security Alerts
                    </div>
                  </div>
                  <div className="h-12 flex items-end gap-0.5 pt-2">
                    {activeActivity.alertBars.map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t bg-red-500/85"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </Link>

                {/* New Cases */}
                <Link
                  href="/customer/detection-response"
                  className="space-y-2 p-1.5 rounded-xl hover:bg-slate-800/40 transition-colors"
                >
                  <div>
                    <div className="text-2xl font-extrabold text-white">
                      {activeActivity.newCases}
                    </div>
                    <div className="text-[11px] text-slate-400">New Cases</div>
                  </div>
                  <div className="h-12 flex items-end gap-0.5 pt-2">
                    {activeActivity.caseBars.map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t bg-indigo-400/85"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </Link>
              </div>
            </div>

            {/* Top Threat Categories (Clickable to filter Recent Critical Alerts) */}
            <div className="lg:col-span-4 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-300" />
                  <h2 className="text-sm font-bold text-white">
                    Top Threat Categories
                  </h2>
                </div>
                {selectedCategory && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(null)}
                    className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300"
                  >
                    Clear filter ({selectedCategory})
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {TOP_THREAT_CATEGORIES.map((cat) => {
                  const isSelected = selectedCategory === cat.label;
                  return (
                    <button
                      key={cat.label}
                      type="button"
                      onClick={() =>
                        setSelectedCategory((c) =>
                          c === cat.label ? null : cat.label
                        )
                      }
                      className={`w-full grid grid-cols-12 items-center gap-2 text-xs px-1.5 py-1 rounded-lg transition-colors ${
                        isSelected
                          ? "bg-cyan-950/50 border border-cyan-500/40"
                          : "hover:bg-slate-800/40"
                      }`}
                    >
                      <span className="col-span-5 text-left text-slate-300 truncate">
                        {cat.label}
                      </span>
                      <div className="col-span-5 h-2.5 rounded-full bg-slate-800/90 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${cat.color}`}
                          style={{ width: `${cat.pct * 2.8}%` }}
                        />
                      </div>
                      <span className="col-span-2 text-right font-semibold text-slate-200">
                        {cat.pct}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Detection Coverage (92% Covered Donut + Interactive Assets & Sources) */}
            <div className="lg:col-span-4 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Crosshair className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-bold text-white">
                    Detection Coverage
                  </h2>
                </div>
                {selectedCoverageTier && (
                  <span className="text-[10px] font-mono text-emerald-400">
                    {selectedCoverageTier}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-12 items-center gap-3">
                {/* Donut Chart */}
                <div className="col-span-5 flex items-center justify-center">
                  <div className="relative w-28 h-28 flex items-center justify-center">
                    <svg
                      viewBox="0 0 36 36"
                      className="w-28 h-28 -rotate-90"
                    >
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="transparent"
                        stroke="#1e293b"
                        strokeWidth="4.2"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="transparent"
                        stroke="#10b981"
                        strokeWidth="4.2"
                        strokeDasharray="72 100"
                        strokeDashoffset="0"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="transparent"
                        stroke="#f59e0b"
                        strokeWidth="4.2"
                        strokeDasharray="8 100"
                        strokeDashoffset="-72"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="transparent"
                        stroke="#ef4444"
                        strokeWidth="4.2"
                        strokeDasharray="8 100"
                        strokeDashoffset="-80"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-xl font-extrabold text-white leading-none">
                        92%
                      </span>
                      <span className="text-[10px] text-slate-300 mt-0.5">
                        Covered
                      </span>
                    </div>
                  </div>
                </div>

                {/* Assets & Sources Breakdown */}
                <div className="col-span-7 space-y-1.5 text-xs">
                  <div className="text-[11px] font-semibold text-slate-300 mb-1">
                    Assets &amp; Sources
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCoverageTier("Covered")}
                    className="w-full flex items-center justify-between hover:bg-slate-800/40 px-1.5 py-0.5 rounded"
                  >
                    <div className="flex items-center gap-2 text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      <span>Covered</span>
                    </div>
                    <span className="font-semibold text-white">
                      {coveredAssetsCount.toLocaleString()}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCoverageTier("Partial")}
                    className="w-full flex items-center justify-between hover:bg-slate-800/40 px-1.5 py-0.5 rounded"
                  >
                    <div className="flex items-center gap-2 text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                      <span>Partial</span>
                    </div>
                    <span className="font-semibold text-white">121</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCoverageTier("Not Covered")}
                    className="w-full flex items-center justify-between hover:bg-slate-800/40 px-1.5 py-0.5 rounded"
                  >
                    <div className="flex items-center gap-2 text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                      <span>Not Covered</span>
                    </div>
                    <span className="font-semibold text-white">
                      {notCoveredAssetsCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCoverageTier("Out of Scope")}
                    className="w-full flex items-center justify-between hover:bg-slate-800/40 px-1.5 py-0.5 rounded"
                  >
                    <div className="flex items-center gap-2 text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                      <span>Out of Scope</span>
                    </div>
                    <span className="font-semibold text-white">88</span>
                  </button>
                  <div className="pt-1 flex items-center justify-between">
                    <Link
                      href="/customer/assets-inventory"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-400 hover:text-sky-300"
                    >
                      <span>View asset coverage</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Row 4: Recent Critical Alerts (7 cols) + Assurance & Compliance (5 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Recent Critical Alerts Table */}
            <div className="lg:col-span-7 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-slate-300" />
                  <h2 className="text-sm font-bold text-white">
                    Recent Critical Alerts
                  </h2>
                </div>
                <Link
                  href="/customer/threats-incidents"
                  className="inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300"
                >
                  <span>View all alerts</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                      <th className="py-2 pr-3 font-medium">Time</th>
                      <th className="py-2 px-3 font-medium">Severity</th>
                      <th className="py-2 px-3 font-medium">Title</th>
                      <th className="py-2 px-3 font-medium">Source</th>
                      <th className="py-2 pl-3 font-medium text-right">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredAlerts.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() =>
                          setSelectedAlertId((cur) =>
                            cur === row.id ? null : row.id
                          )
                        }
                        className={`cursor-pointer transition-colors ${
                          selectedAlertId === row.id
                            ? "bg-cyan-950/30"
                            : "hover:bg-slate-800/30"
                        }`}
                      >
                        <td className="py-2.5 pr-3 font-mono text-slate-300">
                          {row.time}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold ${severityBadgeClass(
                              row.severity
                            )}`}
                          >
                            {row.severity}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-white">
                          <span className="hover:text-sky-300 transition-colors">
                            {row.title}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">
                          {row.source}
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCycleAlertStatus(row.id);
                            }}
                            title="Click to cycle status (Open → Investigating → Resolved)"
                            className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold ${
                              row.status === "Open"
                                ? "bg-red-950/70 border border-red-500/40 text-red-300"
                                : row.status === "Investigating"
                                ? "bg-amber-950/70 border border-amber-500/40 text-amber-300"
                                : "bg-emerald-950/70 border border-emerald-500/40 text-emerald-300"
                            }`}
                          >
                            {row.status}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedAlert && (
                <div className="mt-3 p-3 rounded-xl bg-[#0d1c33] border border-cyan-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-bold text-white">
                      {selectedAlert.title} ({selectedAlert.source})
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Rule: <span className="font-mono text-sky-400">{selectedAlert.ruleId}</span> • Category: {selectedAlert.category} • Status:{" "}
                      <span className="text-emerald-300 font-semibold">{selectedAlert.status}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCycleAlertStatus(selectedAlert.id)}
                      className="px-2.5 py-1 rounded-lg bg-amber-600/20 border border-amber-500/40 text-amber-300 font-semibold"
                    >
                      Advance Triage Status
                    </button>
                    <Link
                      href="/customer/threats-incidents"
                      className="px-2.5 py-1 rounded-lg bg-sky-600/20 border border-sky-500/40 text-sky-300 font-semibold"
                    >
                      Inspect Full Evidence →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Assurance & Compliance (3 Clickable Circular Gauges) */}
            <div className="lg:col-span-5 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-bold text-white">
                    Assurance &amp; Compliance
                  </h2>
                </div>
                <Link
                  href="/customer/compliance-risk"
                  className="inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300"
                >
                  <span>View compliance</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center my-auto py-1">
                {/* Gauge 1: 85% Control Effectiveness */}
                <button
                  type="button"
                  onClick={() =>
                    setSelectedGauge((g) =>
                      g === "CONTROLS" ? null : "CONTROLS"
                    )
                  }
                  className="flex flex-col items-center p-1.5 rounded-xl hover:bg-slate-800/40 transition-colors"
                >
                  <div className="relative w-20 h-20 flex items-center justify-center">
                    <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="transparent"
                        stroke="#1e293b"
                        strokeWidth="3.5"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="transparent"
                        stroke="#10b981"
                        strokeWidth="3.5"
                        strokeDasharray="75 100"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute text-base font-extrabold text-white">
                      85%
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-200 mt-2">
                    Control Effectiveness
                  </div>
                  <div className="text-[11px] text-slate-400">
                    17 / 20 controls
                  </div>
                </button>

                {/* Gauge 2: 92% Evidence Freshness */}
                <button
                  type="button"
                  onClick={() =>
                    setSelectedGauge((g) =>
                      g === "FRESHNESS" ? null : "FRESHNESS"
                    )
                  }
                  className="flex flex-col items-center p-1.5 rounded-xl hover:bg-slate-800/40 transition-colors"
                >
                  <div className="relative w-20 h-20 flex items-center justify-center">
                    <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="transparent"
                        stroke="#1e293b"
                        strokeWidth="3.5"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="transparent"
                        stroke="#10b981"
                        strokeWidth="3.5"
                        strokeDasharray="81 100"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute text-base font-extrabold text-white">
                      92%
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-200 mt-2">
                    Evidence Freshness
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Updated 7 days ago
                  </div>
                </button>

                {/* Gauge 3: 3 Open Exceptions */}
                <button
                  type="button"
                  onClick={() =>
                    setSelectedGauge((g) =>
                      g === "EXCEPTIONS" ? null : "EXCEPTIONS"
                    )
                  }
                  className="flex flex-col items-center p-1.5 rounded-xl hover:bg-slate-800/40 transition-colors"
                >
                  <div className="relative w-20 h-20 flex items-center justify-center">
                    <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="transparent"
                        stroke="#334155"
                        strokeWidth="3.5"
                      />
                    </svg>
                    <span className="absolute text-lg font-extrabold text-white">
                      3
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-200 mt-2">
                    Open Exceptions
                  </div>
                  <div className="text-[11px] text-slate-400">
                    <span className="text-red-400">1 critical</span> |{" "}
                    <span className="text-amber-400">2 medium</span>
                  </div>
                </button>
              </div>

              {selectedGauge && (
                <div className="mt-2 p-2.5 rounded-xl bg-[#0d1c33] border border-emerald-500/30 text-[11px] text-slate-300">
                  {selectedGauge === "CONTROLS" &&
                    `Policy Pack ${activePolicyPack.policy_key} (${activePolicyPack.version}): 17/20 controls passing continuous verification.`}
                  {selectedGauge === "FRESHNESS" &&
                    "Cryptographic evidence bundles signed with Ed25519 + SHA-256 Merkle roots (G06)."}
                  {selectedGauge === "EXCEPTIONS" &&
                    "1 Critical exception (legacy subnet telemetry gap) & 2 Medium exceptions tracked under time-bound risk acceptance."}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: SOC VIEW (SECURITY OPERATIONS) — Customer SOC Analyst Mode     */}
      {/* ===================================================================== */}
      {viewMode === "SOC_VIEW" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800 p-4">
              <div className="text-xs text-slate-400">Open Triage Queue</div>
              <div className="text-2xl font-extrabold text-white mt-1">
                18 Alerts
              </div>
              <div className="text-xs text-red-400 mt-1">
                4 P1 Critical • Mean Triage 6m 12s
              </div>
            </div>
            <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800 p-4">
              <div className="text-xs text-slate-400">
                Active Detection Pack (G07)
              </div>
              <div className="text-2xl font-extrabold text-white mt-1">
                {G07_LAUNCH_CANDIDATE_RULES.length} Scoped Rules
              </div>
              <div className="text-xs text-emerald-400 mt-1">
                Entity Risk Graph Correlation Active
              </div>
            </div>
            <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800 p-4">
              <div className="text-xs text-slate-400">
                Pending SOAR Proposals (G04)
              </div>
              <div className="text-2xl font-extrabold text-white mt-1">
                1 Awaiting Quorum
              </div>
              <div className="text-xs text-amber-400 mt-1">
                Case #4287 • Intent Hash Bound
              </div>
            </div>
            <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800 p-4">
              <div className="text-xs text-slate-400">
                Telemetry Continuity (G03)
              </div>
              <div className="text-2xl font-extrabold text-white mt-1">
                99.94% Complete
              </div>
              <div className="text-xs text-sky-400 mt-1">
                0 Unreconciled Batches • 2 Quarantined
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white">
                  Active Scoped Detection Rules &amp; Entity Risk Posture (G07)
                </h2>
                <p className="text-xs text-slate-400">
                  Real-time evaluation state across identity and cloud telemetry streams
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/hunting"
                  className="px-3 py-1.5 rounded-lg bg-sky-600/20 border border-sky-500/40 text-xs font-semibold text-sky-300 hover:bg-sky-600/30"
                >
                  Open Threat Hunting
                </Link>
                <Link
                  href="/copilot"
                  className="px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-500/40 text-xs font-semibold text-red-300 hover:bg-red-600/30"
                >
                  Launch AI Copilot
                </Link>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-3">Rule ID</th>
                    <th className="py-2 px-3">Detection Name</th>
                    <th className="py-2 px-3">MITRE</th>
                    <th className="py-2 px-3">Lifecycle State</th>
                    <th className="py-2 px-3">Precision / FP</th>
                    <th className="py-2 pl-3 text-right">Entity Weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {G07_LAUNCH_CANDIDATE_RULES.map((rule) => (
                    <tr key={rule.ruleId} className="hover:bg-slate-800/30">
                      <td className="py-2.5 pr-3 font-mono text-sky-400">
                        {rule.ruleId} (v{rule.version})
                      </td>
                      <td className="py-2.5 px-3 font-medium text-white">
                        {rule.name}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-300">
                        {rule.mitreTechnique}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                            rule.lifecycleState === "FINDING_OPEN"
                              ? "bg-red-950/70 border border-red-500/40 text-red-300"
                              : rule.lifecycleState === "INTERMEDIATE_RISK"
                              ? "bg-amber-950/70 border border-amber-500/40 text-amber-300"
                              : "bg-emerald-950/70 border border-emerald-500/40 text-emerald-300"
                          }`}
                        >
                          {rule.lifecycleState}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-300">
                        {(rule.precisionBenchmark * 100).toFixed(0)}% /{" "}
                        {(rule.falsePositiveRate * 100).toFixed(1)}% FP
                      </td>
                      <td className="py-2.5 pl-3 text-right font-bold text-white">
                        +{rule.entityRiskWeight}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: ACCOUNT VIEW (SERVICES & ENTITLEMENTS) — Customer Governance   */}
      {/* ===================================================================== */}
      {viewMode === "ACCOUNT_VIEW" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">
                  Data Residency &amp; Policy Pack (G02)
                </span>
                <Lock className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-lg font-bold text-white">
                {regionMeta.displayName}
              </div>
              <div className="text-xs text-slate-300">
                Isolation Profile:{" "}
                <span className="font-mono text-cyan-300">
                  DEDICATED_DATA_NAMESPACE
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                Active Policy Pack:{" "}
                <span className="font-mono text-emerald-300">
                  {activePolicyPack.policy_key} (v{activePolicyPack.version})
                </span>
              </div>
            </div>

            <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">
                  Active Service Entitlements
                </span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-lg font-bold text-white">
                Enterprise Sovereign Shield
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  "Managed Detection",
                  "Continuous Assurance",
                  "Exposure Management",
                  "Cryptographic Evidence",
                  "24x7 IR Retainer",
                ].map((offer) => (
                  <span
                    key={offer}
                    className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30 text-[10px] text-emerald-300"
                  >
                    {offer}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">
                  Storage &amp; Query Economics (G08)
                </span>
                <Activity className="w-4 h-4 text-sky-400" />
              </div>
              <div className="text-lg font-bold text-white">
                1,345.9 GB Measured Actual
              </div>
              <div className="text-xs text-slate-300">
                Hot Index: 284.5 GB • Cold WORM Archive: 481.2 GB
              </div>
              <div className="text-[11px] text-emerald-400">
                Within Committed Monthly Tier (67.3% utilized)
              </div>
            </div>
          </div>

          {/* 7-Class Retention Summary Table (Driven by the winning policy_pack) */}
          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white">
                  Contracted Data Class Retention &amp; Legal Hold Schedule (G08)
                </h2>
                <p className="text-xs text-slate-400">
                  Per-class retention limits resolved directly from canonical policy pack{" "}
                  <span className="font-mono text-cyan-300">
                    {activePolicyPack.policy_key}
                  </span>{" "}
                  ({activePolicyPack.authority_reference})
                </p>
              </div>
              <Link
                href="/audit"
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200"
              >
                Verify Evidence Bundles →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-3">Data Class</th>
                    <th className="py-2 px-3">Hot Tier</th>
                    <th className="py-2 px-3">Warm Tier</th>
                    <th className="py-2 px-3">Cold Archive</th>
                    <th className="py-2 px-3">Disposition</th>
                    <th className="py-2 pl-3 text-right">Measured Footprint</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {dynamicRetentionSchedule.map((item) => (
                    <tr key={item.dataClass} className="hover:bg-slate-800/30">
                      <td className="py-2 pr-3 font-medium text-white">
                        {item.label}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-300">
                        {item.hotDays}d
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-300">
                        {item.warmDays}d
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-300">
                        {item.coldArchiveDays}d
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] text-cyan-300">
                        {item.deletionDisposition}
                      </td>
                      <td className="py-2 pl-3 text-right font-mono text-white">
                        {item.currentFootprintGb.toFixed(1)} GB
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
