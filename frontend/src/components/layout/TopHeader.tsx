"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { findActiveNav } from "@/components/layout/nav-config";
import {
  Search,
  Bell,
  HelpCircle,
  Sun,
  Moon,
  ShieldCheck,
  AlertTriangle,
  Activity,
  User,
  ChevronRight,
  Command,
  CheckCircle2,
  Check,
  Laptop,
  Sliders,
  LogOut,
  KeyRound,
  ShieldAlert,
  Sparkles,
  X,
  ArrowRight,
  Zap,
  Lock,
  RotateCcw,
  Radio,
  FileText,
  Mail,
} from "lucide-react";

interface HeaderNotification {
  id: string;
  title: string;
  category: "P0_ALERT" | "JIT_QUORUM" | "MERKLE_SEAL" | "AI_DRIFT" | "SOAR_FREEZE";
  severity: "CRITICAL" | "HIGH" | "INFO";
  timeAgo: string;
  acknowledged: boolean;
  route: string;
}

const DEFAULT_NOTIFICATIONS: HeaderNotification[] = [
  {
    id: "notif-1",
    title: "P0 Alert: Credential-Stuffing Burst detected on ec2-jump-01",
    category: "P0_ALERT",
    severity: "CRITICAL",
    timeAgo: "2m ago",
    acknowledged: false,
    route: "/cases/incidents/command",
  },
  {
    id: "notif-2",
    title: "JIT Elevation Request awaiting 2nd signatory quorum (DB Admin)",
    category: "JIT_QUORUM",
    severity: "HIGH",
    timeAgo: "14m ago",
    acknowledged: false,
    route: "/admin/jit-elevation",
  },
  {
    id: "notif-3",
    title: "EU AI Act Drift Alert: Model PSI Variance on Gemini 1.5 Pro",
    category: "AI_DRIFT",
    severity: "HIGH",
    timeAgo: "28m ago",
    acknowledged: false,
    route: "/ai-governance",
  },
  {
    id: "notif-4",
    title: "Cryptographic Epoch #1043 sealed with FIPS 204 ML-DSA-65",
    category: "MERKLE_SEAL",
    severity: "INFO",
    timeAgo: "1h ago",
    acknowledged: false,
    route: "/ledger",
  },
  {
    id: "notif-5",
    title: "Emergency SOAR execution freeze engaged in simulation sandbox",
    category: "SOAR_FREEZE",
    severity: "INFO",
    timeAgo: "2h ago",
    acknowledged: true,
    route: "/actions",
  },
];

const SEARCH_ITEMS = [
  // 16 Demo Walkthrough Stages
  { type: "DEMO STEP", title: "1. Platform Service Health Matrix", subtitle: "Core microservices, storage engines, DR drill", route: "/admin/platform-health" },
  { type: "DEMO STEP", title: "2. G1 Launch Gate Multi-Signer Protocol", subtitle: "8-domain cryptographic ratification ceremony", route: "/admin/g1-gate" },
  { type: "DEMO STEP", title: "3. Executive Risk & Financial Exposure", subtitle: "Board-level CISO scorecard & attack path", route: "/risk" },
  { type: "DEMO STEP", title: "4. Detection & Alerts Queue", subtitle: "OCSF-normalized multi-source telemetry storm", route: "/alerts" },
  { type: "DEMO STEP", title: "5. Incident Command War Room", subtitle: "P1 Major incident orchestration, host containment", route: "/cases/incidents/command" },
  { type: "DEMO STEP", title: "6. AI Security Copilot (Spec §16.1)", subtitle: "10-field decision review envelope, KMS signing", route: "/copilot" },
  { type: "DEMO STEP", title: "7. AI Safety & Governance Cockpit", subtitle: "NIST AI RMF, EU AI Act, Model Armor filters", route: "/ai-governance" },
  { type: "DEMO STEP", title: "8. Cedar Policy Lifecycle & Canary", subtitle: "Side-by-side YAML diff, 4-eyes approval ring", route: "/policies" },
  { type: "DEMO STEP", title: "9. JIT Privileged Access Quorum", subtitle: "Zero standing privileges, FIDO2 hardware step-up", route: "/admin/jit-elevation" },
  { type: "DEMO STEP", title: "10. Autonomous SOAR Sandboxing", subtitle: "WASM dry-run simulation, 0-blast-radius receipt", route: "/response-proposals" },
  { type: "DEMO STEP", title: "11. Emergency Kill-Switch & Circuit Breakers", subtitle: "Super-admin kill-switches, tenant capability toggles", route: "/admin" },
  { type: "DEMO STEP", title: "12. RFC 3161 Merkle Evidence Ledger", subtitle: "Immutable Merkle proof explorer, PQC signatures", route: "/ledger" },
  { type: "DEMO STEP", title: "13. Continuous Security Controls Matrix", subtitle: "Real-time SOC 2 Type II & ISO 27001 evaluation", route: "/controls" },
  { type: "DEMO STEP", title: "14. Commercial Pricing & Sizing Calculator", subtitle: "Anti-perverse pricing guarantee, band guidance", route: "/pricing" },
  { type: "DEMO STEP", title: "15. Notification Center & Delivery Ledger", subtitle: "Audited delivery tracking, DLQ replay ledger", route: "/notifications" },
  { type: "DEMO STEP", title: "16. 226 Production Email Templates Studio", subtitle: "Fail-closed security release gate test", route: "/admin/email-templates" },

  // Operational Workspaces
  { type: "WORKSPACE", title: "Command Center Dashboard", subtitle: "Primary SecOps operational command", route: "/" },
  { type: "WORKSPACE", title: "Threat Hunting Workbench", subtitle: "Read-only multi-source query exploration", route: "/hunting" },
  { type: "WORKSPACE", title: "Simulation & Training (Red Team)", subtitle: "ERB-01 attack replay scenario", route: "/red-team" },
  { type: "WORKSPACE", title: "SOAR Actions & Global Freeze", subtitle: "Controlled execution and rollback tokens", route: "/actions" },
  { type: "WORKSPACE", title: "Connectors Setup Wizard", subtitle: "Secure multi-cloud ingestion configuration", route: "/connectors" },
  { type: "WORKSPACE", title: "Assets & Cloud Inventory", subtitle: "Continuous attack surface asset mapping", route: "/assets" },
  { type: "WORKSPACE", title: "Offline Certificate Verifier", subtitle: "Zero-dependency independent cryptographic verifier", route: "/verify-certificate" },
  { type: "WORKSPACE", title: "MSSP Fleet & 2-Party JIT", subtitle: "Multi-tenant MSSP fleet management", route: "/partner/fleet" },
  { type: "WORKSPACE", title: "Team & Access Control", subtitle: "Tenant memberships, passkeys & separation of duties", route: "/team" },
  { type: "WORKSPACE", title: "Trust Center & Attestations", subtitle: "Public security standards, SOC 2, ISO 27001", route: "/trust" },
  { type: "WORKSPACE", title: "Tenant Management & Boundaries", subtitle: "Data residency, sovereign boundaries & profile", route: "/tenant-management" },
  { type: "WORKSPACE", title: "Product Guides & Runbooks", subtitle: "Integrated help, documentation & troubleshooting", route: "/help" },
  { type: "WORKSPACE", title: "Tenant Onboarding Wizard", subtitle: "Organization profile & sovereign data fencing", route: "/onboarding" },
  { type: "WORKSPACE", title: "Auditor Sealed Verification Portal", subtitle: "Independent external auditor verification", route: "/auditor" },
  { type: "WORKSPACE", title: "Regulated Sector Packs", subtitle: "DORA, HIPAA, FedRAMP, and CMMC industry overlays", route: "/sector-packs" },
];

export const TopHeader: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setDemoState] = useDemoState();

  // Active Dropdown Popovers
  const [activeMenu, setActiveMenu] = useState<"notifications" | "theme" | "profile" | "help" | null>(null);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSearchIdx, setSelectedSearchIdx] = useState(0);

  // Notifications State
  const [notifications, setNotifications] = useState<HeaderNotification[]>(DEFAULT_NOTIFICATIONS);

  // Theme & Brightness State
  const [themeMode, setThemeMode] = useState<"dark" | "light" | "cyber">("dark");
  const [brightness, setBrightness] = useState<number>(100);

  // Platform Health Readiness
  const [healthStatus, setHealthStatus] = useState<{
    healthyCount: number;
    totalCount: number;
    state: string;
  }>({ healthyCount: 5, totalCount: 5, state: "OK" });

  const navRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 1. Initial Mount: Load & Apply Theme / Brightness Preferences
  useEffect(() => {
    try {
      const savedTheme = (localStorage.getItem("zoiko_theme") as "dark" | "light" | "cyber") || "dark";
      setThemeMode(savedTheme);
      document.documentElement.className = savedTheme;

      const savedBrightness = localStorage.getItem("zoiko_brightness");
      if (savedBrightness) {
        const b = Number(savedBrightness);
        if (!isNaN(b) && b >= 70 && b <= 130) {
          setBrightness(b);
          document.documentElement.style.filter = b === 100 ? "none" : `brightness(${b}%)`;
        }
      }
    } catch {}
  }, []);

  // 2. Fetch Real Health Readiness
  useEffect(() => {
    let mounted = true;
    const fetchHealth = async () => {
      try {
        const snap = await ZoikoShieldApiClient.getPlatformReadiness();
        if (mounted && snap) {
          const healthy = snap.healthyServicesCount ?? 5;
          const total = snap.totalServicesCount ?? 5;
          const isDegraded = (snap.degradedServicesCount ?? 0) > 0;
          setHealthStatus({
            healthyCount: healthy,
            totalCount: total,
            state: isDegraded ? "DEGRADED" : "OK",
          });
        }
      } catch {}
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // 3. Global Keyboard Shortcuts: ⌘K / Ctrl+K & Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchModalOpen((prev) => !prev);
        setActiveMenu(null);
      }
      if (e.key === "Escape") {
        setIsSearchModalOpen(false);
        setActiveMenu(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 4. Click Outside Listener to Close Popovers
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 5. Auto-focus search input when search modal opens
  useEffect(() => {
    if (isSearchModalOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
      setSelectedSearchIdx(0);
    }
  }, [isSearchModalOpen]);

  // Theme Switcher Handlers
  const handleThemeChange = (mode: "dark" | "light" | "cyber") => {
    setThemeMode(mode);
    document.documentElement.className = mode;
    try {
      localStorage.setItem("zoiko_theme", mode);
    } catch {}
  };

  const handleBrightnessChange = (val: number) => {
    setBrightness(val);
    document.documentElement.style.filter = val === 100 ? "none" : `brightness(${val}%)`;
    try {
      localStorage.setItem("zoiko_brightness", String(val));
    } catch {}
  };

  const handleResetBrightness = () => {
    handleBrightnessChange(100);
  };

  // Notification Handlers
  const unreadCount = notifications.filter((n) => !n.acknowledged).length;

  const handleAcknowledgeNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, acknowledged: true } : n))
    );
  };

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, acknowledged: true })));
  };

  // Demo Persona Switcher
  const handleSwitchPersona = (
    roleName: string,
    roleTitle: "SECURITY_ANALYST" | "SUPER_ADMIN" | "TENANT_OWNER" | "AUDITOR",
    email: string
  ) => {
    setDemoState({
      ...state,
      session: {
        ...state.session,
        fullName: roleName,
        role: roleTitle,
        email: email,
      },
    });
    setActiveMenu(null);
  };

  // Filter Search Items
  const filteredSearchItems = SEARCH_ITEMS.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.subtitle.toLowerCase().includes(q) ||
      item.type.toLowerCase().includes(q)
    );
  });

  const handleSearchSelect = (route: string) => {
    setIsSearchModalOpen(false);
    setSearchQuery("");
    router.push(route);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSearchIdx((prev) => (prev + 1) % Math.max(1, filteredSearchItems.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSearchIdx((prev) =>
        prev <= 0 ? filteredSearchItems.length - 1 : prev - 1
      );
    } else if (e.key === "Enter" && filteredSearchItems[selectedSearchIdx]) {
      e.preventDefault();
      handleSearchSelect(filteredSearchItems[selectedSearchIdx].route);
    }
  };

  // Compute Breadcrumbs
  const getBreadcrumbs = () => {
    const match = findActiveNav(pathname);
    if (match) return { section: match.group.label.toUpperCase(), current: match.item.label };
    if (pathname.startsWith("/pricing")) return { section: "COMMERCIAL & SIZING", current: "Commercial Plan Ladder" };
    if (pathname.startsWith("/help")) return { section: "ZOIKOSHIELD", current: "Help & Documentation" };

    const pathSegment = pathname.split("/").filter(Boolean)[0] || "Command Center";
    return {
      section: "ZOIKOSHIELD",
      current: pathSegment.charAt(0).toUpperCase() + pathSegment.slice(1).replace(/-/g, " "),
    };
  };

  const breadcrumbs = getBreadcrumbs();
  const userInitials = (state.session.fullName || "Sarah Chen")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <header
        ref={navRef}
        className="sticky top-0 z-30 w-full bg-[#080c16]/95 backdrop-blur-md border-b border-[#141d2e] px-4 md:px-6 py-2.5 flex items-center justify-between gap-4 transition-colors"
      >
        {/* Left: Breadcrumbs */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-slate-400 font-medium tracking-wider">
            {breadcrumbs.section}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-cyan-400 font-semibold tracking-wide">
            {breadcrumbs.current}
          </span>
        </div>

        {/* Center: Global Search Bar Trigger (⌘K) */}
        <div className="hidden lg:flex items-center max-w-md w-full relative">
          <button
            type="button"
            onClick={() => setIsSearchModalOpen(true)}
            className="w-full flex items-center justify-between bg-[#0c111e] border border-[#162238] hover:border-cyan-500/40 rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-slate-300 transition-all shadow-sm group"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-400 transition-colors shrink-0" />
              <span className="text-slate-400 font-sans text-xs">Search alerts, cases, assets, controls...</span>
            </div>
            <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#141d2e] border border-slate-700/60 text-[10px] font-mono text-slate-400 group-hover:text-cyan-300 transition-colors">
              <Command className="w-2.5 h-2.5" />
              <span>K</span>
            </div>
          </button>
        </div>

        {/* Right: Actions, Badges & Interactive Dropdowns */}
        <div className="flex items-center gap-3 shrink-0 relative">
          {/* Environment / Demo Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-mono font-medium">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span>SIMULATED DEMO</span>
          </div>

          {/* Region Indicator */}
          <div className="hidden xl:flex items-center gap-1.5 text-slate-400 text-xs font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{state.tenant.homeRegion || "US East (1)"}</span>
          </div>

          {/* Real-time Telemetry Stream Ticker */}
          <Link
            href="/ingestion"
            title="Live Normalized Telemetry Ingestion (OCSF)"
            className="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono font-bold shadow-[0_0_12px_rgba(16,185,129,0.2)] hover:border-emerald-400/60 transition-all"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span>INGEST: 1,420 eps</span>
            <span className="text-emerald-500">•</span>
            <span className="text-slate-400 font-normal">P99: 14ms</span>
          </Link>

          {/* Microservices Health */}
          <Link
            href="/admin/platform-health"
            title="Microservices Readiness Health (Step 1)"
            className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded bg-[#0c111e] border border-[#162238] hover:border-cyan-500/40 text-xs font-mono text-slate-300 transition-colors"
          >
            <Activity
              className={`w-3.5 h-3.5 ${
                healthStatus.state === "OK" ? "text-cyan-400" : "text-amber-400"
              }`}
            />
            <span className="text-[11px] text-slate-400">{healthStatus.healthyCount}/{healthStatus.totalCount} OK</span>
          </Link>

          {/* 1. Interactive Notification Bell */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActiveMenu((prev) => (prev === "notifications" ? null : "notifications"))}
              className={`relative p-1.5 rounded-lg transition-colors ${
                activeMenu === "notifications"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.3)]"
                  : "text-slate-400 hover:text-slate-200 hover:bg-[#141d2e]"
              }`}
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-mono font-black text-white shadow-[0_0_8px_rgba(244,63,94,0.6)] animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notification Popover Dropdown */}
            {activeMenu === "notifications" && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-[#0a0f1d] border border-cyan-500/40 shadow-[0_10px_40px_rgba(0,0,0,0.85)] z-50 overflow-hidden text-slate-200 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="p-3.5 bg-gradient-to-r from-[#0d1527] to-[#080d19] border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                      Live Notification Center
                    </span>
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-[10px] font-mono text-cyan-300 font-bold">
                        {unreadCount} NEW
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 underline"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-800/60">
                  {notifications.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        setActiveMenu(null);
                        router.push(item.route);
                      }}
                      className={`p-3 transition-colors cursor-pointer flex flex-col gap-1.5 ${
                        item.acknowledged
                          ? "bg-[#080c16]/50 opacity-70 hover:opacity-100 hover:bg-[#0c1222]"
                          : "bg-cyan-950/20 hover:bg-cyan-950/40"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase ${
                            item.severity === "CRITICAL"
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                              : item.severity === "HIGH"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                              : "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                          }`}
                        >
                          {item.severity}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">{item.timeAgo}</span>
                      </div>
                      <p className="text-xs text-slate-200 font-medium leading-snug">{item.title}</p>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] font-mono text-cyan-400 flex items-center gap-1 hover:underline">
                          <span>View Detail</span>
                          <ArrowRight className="w-2.5 h-2.5" />
                        </span>
                        {!item.acknowledged ? (
                          <button
                            type="button"
                            onClick={(e) => handleAcknowledgeNotification(item.id, e)}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-emerald-600 hover:text-white border border-slate-700 text-[10px] font-mono text-slate-300 transition-colors flex items-center gap-1"
                          >
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Ack</span>
                          </button>
                        ) : (
                          <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Acknowledged</span>
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-2.5 bg-[#080c16] border-t border-slate-800 text-center">
                  <Link
                    href="/notifications"
                    onClick={() => setActiveMenu(null)}
                    className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-cyan-400 hover:text-cyan-300"
                  >
                    <span>Open Full Notification Ledger (Step 15)</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* 2. Interactive Help & Documentation */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActiveMenu((prev) => (prev === "help" ? null : "help"))}
              className={`p-1.5 rounded-lg transition-colors ${
                activeMenu === "help"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                  : "text-slate-400 hover:text-slate-200 hover:bg-[#141d2e]"
              }`}
              title="Help & Shortcuts"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {/* Help Popover Dropdown */}
            {activeMenu === "help" && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-[#0a0f1d] border border-cyan-500/40 shadow-[0_10px_40px_rgba(0,0,0,0.85)] z-50 p-4 text-xs font-mono text-slate-300 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <HelpCircle className="w-4 h-4 text-cyan-400" />
                    <span>Platform Guide</span>
                  </span>
                  <span className="text-[10px] text-cyan-400 font-bold">ZoikoShield v3.2</span>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                    Keyboard Shortcuts
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded bg-slate-900 border border-slate-800">
                    <span className="text-slate-300">Global Command Search</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-cyan-300 font-bold">
                      ⌘K / Ctrl+K
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded bg-slate-900 border border-slate-800">
                    <span className="text-slate-300">Close Popover / Modal</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300">
                      Esc
                    </kbd>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex flex-col gap-1.5">
                  <Link
                    href="/trust"
                    onClick={() => setActiveMenu(null)}
                    className="text-cyan-400 hover:text-cyan-300 flex items-center justify-between py-1"
                  >
                    <span>Trust Center & Attestations</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                  <Link
                    href="/developer"
                    onClick={() => setActiveMenu(null)}
                    className="text-cyan-400 hover:text-cyan-300 flex items-center justify-between py-1"
                  >
                    <span>Developer API & Schemas</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* 3. Interactive Theme & Brightness Controls */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActiveMenu((prev) => (prev === "theme" ? null : "theme"))}
              className={`p-1.5 rounded-lg transition-colors ${
                activeMenu === "theme"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                  : "text-slate-400 hover:text-cyan-400 hover:bg-[#141d2e]"
              }`}
              title="Display & Theme Settings"
            >
              {themeMode === "light" ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-cyan-400" />
              )}
            </button>

            {/* Theme & Brightness Popover */}
            {activeMenu === "theme" && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-[#0a0f1d] border border-cyan-500/40 shadow-[0_10px_40px_rgba(0,0,0,0.85)] z-50 p-4 text-xs font-mono text-slate-200 space-y-4 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-cyan-400" />
                    <span>Display & Theme</span>
                  </span>
                  <span className="text-[10px] text-cyan-400 font-bold uppercase">{themeMode}</span>
                </div>

                {/* Theme Mode Selector */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Interface Mode
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleThemeChange("dark")}
                      className={`p-2 rounded-lg flex flex-col items-center gap-1 border transition-all ${
                        themeMode === "dark"
                          ? "bg-cyan-500/20 border-cyan-500/60 text-cyan-300 font-bold shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      <Moon className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="text-[10px]">Dark</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleThemeChange("light")}
                      className={`p-2 rounded-lg flex flex-col items-center gap-1 border transition-all ${
                        themeMode === "light"
                          ? "bg-amber-500/20 border-amber-500/60 text-amber-300 font-bold shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      <Sun className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[10px]">Light</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleThemeChange("cyber")}
                      className={`p-2 rounded-lg flex flex-col items-center gap-1 border transition-all ${
                        themeMode === "cyber"
                          ? "bg-cyan-500/30 border-cyan-400 text-white font-bold shadow-[0_0_15px_rgba(6,182,212,0.5)]"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                      <span className="text-[10px]">Cyber</span>
                    </button>
                  </div>
                </div>

                {/* Brightness Control Slider */}
                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="uppercase font-bold text-slate-400 tracking-wider">
                      Screen Brightness
                    </span>
                    <span className="text-cyan-300 font-bold">{brightness}%</span>
                  </div>
                  <input
                    type="range"
                    min="70"
                    max="130"
                    step="5"
                    value={brightness}
                    onChange={(e) => handleBrightnessChange(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-[9px] text-slate-500">70% (Dim)</span>
                    <button
                      type="button"
                      onClick={handleResetBrightness}
                      className="text-[9px] text-cyan-400 hover:underline"
                    >
                      Reset (100%)
                    </button>
                    <span className="text-[9px] text-slate-500">130% (High)</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 4. Interactive User Profile & Persona Switcher */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActiveMenu((prev) => (prev === "profile" ? null : "profile"))}
              className={`flex items-center gap-2 pl-2 border-l border-[#162238] transition-all rounded-r-lg p-1 ${
                activeMenu === "profile" ? "bg-[#141d2e]" : "hover:bg-[#101726]"
              }`}
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-bold text-xs shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                {userInitials || "SC"}
              </div>
              <div className="hidden sm:block text-left text-xs leading-tight">
                <div className="font-semibold text-slate-200">
                  {state.session.fullName || "Sarah Chen"}
                </div>
                <div className="text-[10px] font-mono text-cyan-400">
                  {state.session.role?.replace(/_/g, " ") || "Security Analyst"}
                </div>
              </div>
            </button>

            {/* Direct Prominent Logout Button */}
            <button
              type="button"
              onClick={() => {
                ZoikoShieldApiClient.logout();
                window.location.href = "/login?logout=true";
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold text-rose-400 bg-rose-950/30 hover:bg-rose-900/50 border border-rose-500/30 hover:border-rose-500/60 shadow-[0_0_10px_rgba(244,63,94,0.15)] transition-all ml-1.5"
              title="Sign Out of ZoikoShield Platform"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden sm:inline">Logout</span>
            </button>

            {/* Profile & Switcher Popover */}
            {activeMenu === "profile" && (
              <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-[#0a0f1d] border border-cyan-500/40 shadow-[0_10px_40px_rgba(0,0,0,0.85)] z-50 p-4 text-xs font-mono text-slate-200 space-y-4 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-black text-sm shadow-[0_0_12px_rgba(6,182,212,0.4)]">
                    {userInitials}
                  </div>
                  <div>
                    <div className="font-bold text-sm text-white">{state.session.fullName}</div>
                    <div className="text-[11px] text-cyan-400">{state.session.email}</div>
                    <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>FIDO2 Passkey Level 3 Attested</span>
                    </div>
                  </div>
                </div>

                {/* Organization & Environment */}
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Tenant Organization</div>
                  <div className="text-white font-bold">{state.tenant.organizationName}</div>
                  <div className="text-[10px] text-slate-400">
                    Tier: <span className="text-cyan-300">{state.tenant.planTier}</span> • Region:{" "}
                    <span className="text-cyan-300">{state.tenant.homeRegion}</span>
                  </div>
                </div>

                {/* Demo Persona Switcher */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Switch Active Persona (Demo Role)
                  </label>
                  <div className="space-y-1">
                    {[
                      { name: "Sarah Chen", role: "SECURITY_ANALYST" as const, displayRole: "Security Analyst", email: "sarah.chen@acme.com" },
                      { name: "Marcus Vance", role: "SUPER_ADMIN" as const, displayRole: "SOC Manager", email: "marcus.vance@acme.com" },
                      { name: "Olivia Reed", role: "TENANT_OWNER" as const, displayRole: "CISO / Tenant Owner", email: "olivia.reed@acme.com" },
                    ].map((p) => {
                      const isCurrent = state.session.fullName === p.name;
                      return (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => handleSwitchPersona(p.name, p.role, p.email)}
                          className={`w-full p-2 rounded-lg flex items-center justify-between text-left transition-all border ${
                            isCurrent
                              ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-bold"
                              : "bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800"
                          }`}
                        >
                          <div>
                            <div className="text-xs">{p.name}</div>
                            <div className="text-[10px] text-slate-400">{p.displayRole}</div>
                          </div>
                          {isCurrent && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Quick Links */}
                <div className="pt-2 border-t border-slate-800 flex flex-col gap-1.5">
                  <Link
                    href="/admin/jit-elevation"
                    onClick={() => setActiveMenu(null)}
                    className="text-cyan-400 hover:text-cyan-300 flex items-center justify-between py-1"
                  >
                    <span>Request JIT Elevation (Step 9)</span>
                    <KeyRound className="w-3.5 h-3.5" />
                  </Link>
                  <Link
                    href="/team"
                    onClick={() => setActiveMenu(null)}
                    className="text-cyan-400 hover:text-cyan-300 flex items-center justify-between py-1"
                  >
                    <span>Tenant Members & Passkeys</span>
                    <User className="w-3.5 h-3.5" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMenu(null);
                      ZoikoShieldApiClient.logout();
                      window.location.href = "/login?logout=true";
                    }}
                    className="w-full mt-1.5 p-2 rounded-lg flex items-center justify-between text-left text-xs font-semibold text-rose-400 hover:bg-rose-950/30 border border-rose-500/30 hover:border-rose-500/60 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </div>
                    <ArrowRight className="w-3 h-3 text-rose-400" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 5. Global Command Search Modal (⌘K) */}
      {isSearchModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-start justify-center pt-16 sm:pt-24 px-4 animate-in fade-in duration-150"
          onClick={() => setIsSearchModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-[#090e1c] border border-cyan-500/50 shadow-[0_0_50px_rgba(6,182,212,0.3)] overflow-hidden text-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input Box */}
            <div className="p-4 border-b border-slate-800 flex items-center gap-3 bg-gradient-to-r from-[#0c1428] to-[#070b16]">
              <Search className="w-5 h-5 text-cyan-400 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search demo steps, alerts, cases, assets, controls..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedSearchIdx(0);
                }}
                onKeyDown={handleSearchKeyDown}
                className="w-full bg-transparent border-none outline-none text-sm text-white placeholder-slate-400 font-sans"
              />
              <button
                type="button"
                onClick={() => setIsSearchModalOpen(false)}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Results List */}
            <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-800/60 p-2">
              {filteredSearchItems.length === 0 ? (
                <div className="py-12 text-center text-slate-400 font-mono text-xs">
                  No matching platform commands or demo steps found for &quot;{searchQuery}&quot;.
                </div>
              ) : (
                filteredSearchItems.map((item, idx) => {
                  const isSelected = idx === selectedSearchIdx;
                  return (
                    <button
                      key={item.title + item.route}
                      type="button"
                      onClick={() => handleSearchSelect(item.route)}
                      onMouseEnter={() => setSelectedSearchIdx(idx)}
                      className={`w-full text-left p-3 rounded-xl flex items-center justify-between transition-all ${
                        isSelected
                          ? "bg-cyan-500/20 border border-cyan-500/50 text-white shadow-[0_0_12px_rgba(6,182,212,0.2)]"
                          : "hover:bg-slate-900/60 text-slate-300"
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                              item.type === "DEMO STEP"
                                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                                : "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                            }`}
                          >
                            {item.type}
                          </span>
                          <span className="text-xs font-semibold text-white">{item.title}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono">{item.subtitle}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono text-slate-500">{item.route}</span>
                        <ChevronRight className={`w-4 h-4 ${isSelected ? "text-cyan-400" : "text-slate-600"}`} />
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-[#060a14] border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <div className="flex items-center gap-3">
                <span>
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">↑</kbd>{" "}
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">↓</kbd> to navigate
                </span>
                <span>
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">↵</kbd> to select
                </span>
              </div>
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">esc</kbd> to close
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
