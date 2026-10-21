import {
  LayoutDashboard,
  TrendingUp,
  Bot,
  Bell,
  ShieldAlert,
  Layers,
  FileSearch,
  FolderLock,
  Compass,
  Users,
  Flame,
  AlertOctagon,
  Terminal,
  Zap,
  Skull,
  PhoneCall,
  Building,
  Radio,
  Network,
  CheckSquare,
  Sliders,
  Scale,
  FileWarning,
  BrainCircuit,
  Package,
  GitCommit,
  Archive,
  FileCheck2,
  Eye,
  ShieldCheck,
  UserPlus,
  Globe,
  Activity,
  KeyRound,
  Lock,
  Download,
  Mail,
  Code2,
  Rocket,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";

export type NavBadgeVariant = "critical" | "ai" | "anchored";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Static tag shown next to the label (live counts are added by the Sidebar). */
  tag?: string;
  tagVariant?: NavBadgeVariant;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

// Single source of truth for the app's navigation. Every route appears exactly once;
// the Sidebar renders it and the TopHeader derives its breadcrumbs from it.
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { label: "Command Center", href: "/", icon: LayoutDashboard },
      { label: "Executive Risk", href: "/risk/executive", icon: TrendingUp },
      { label: "AI Security Copilot", href: "/copilot", icon: Bot, tagVariant: "ai" },
      { label: "Notifications", href: "/notifications", icon: Bell },
    ],
  },
  {
    id: "investigate",
    label: "Detect & Investigate",
    items: [
      { label: "Detection & Alerts", href: "/alerts", icon: ShieldAlert },
      { label: "Detection Content", href: "/detections", icon: Layers },
      { label: "Findings", href: "/findings", icon: FileSearch },
      { label: "Cases", href: "/cases", icon: FolderLock },
      { label: "Threat Hunting", href: "/hunting", icon: Compass },
      { label: "SOC Shift Handover", href: "/operations/shift-handover", icon: Users },
    ],
  },
  {
    id: "respond",
    label: "Respond",
    items: [
      { label: "Incident Command", href: "/cases/incidents/command", icon: Flame },
      { label: "Response Proposals", href: "/response-proposals", icon: AlertOctagon },
      { label: "Playbook Runs", href: "/playbooks", icon: Terminal },
      { label: "SOAR Actions & Freeze", href: "/actions", icon: Zap, tag: "R0-R4", tagVariant: "anchored" },
      { label: "Simulation & Training", href: "/red-team", icon: Skull, tag: "SIM", tagVariant: "critical" },
      { label: "IR Retainer & SLA", href: "/ir-retainer", icon: PhoneCall, tag: "24x7", tagVariant: "anchored" },
    ],
  },
  {
    id: "data",
    label: "Assets & Data",
    items: [
      { label: "Assets & Inventory", href: "/assets", icon: Building },
      { label: "Data Sources & Ingestion", href: "/ingestion", icon: Radio },
      { label: "Connectors", href: "/connectors", icon: Network },
    ],
  },
  {
    id: "governance",
    label: "Compliance & Governance",
    items: [
      { label: "Compliance Overview", href: "/compliance", icon: CheckSquare },
      { label: "Controls", href: "/controls", icon: ClipboardCheck },
      { label: "Policies", href: "/policies", icon: Sliders, tag: "4-EYES", tagVariant: "anchored" },
      { label: "Risk & Exceptions", href: "/risk", icon: Scale },
      { label: "Exception Workflow", href: "/exceptions", icon: FileWarning },
      { label: "AI Governance", href: "/ai-governance", icon: BrainCircuit },
      { label: "Sector Packs", href: "/sector-packs", icon: Package },
    ],
  },
  {
    id: "evidence",
    label: "Evidence & Audit",
    items: [
      { label: "Evidence Ledger", href: "/ledger", icon: GitCommit, tag: "MERKLE", tagVariant: "anchored" },
      { label: "Evidence Operations", href: "/evidence-operations", icon: Archive },
      { label: "Audit & Verifier", href: "/audit", icon: FileCheck2 },
      { label: "External Auditor", href: "/auditor", icon: Eye },
      { label: "Trust Center", href: "/trust", icon: ShieldCheck },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    items: [
      { label: "Tenant Management", href: "/tenant-management", icon: Building },
      { label: "Team & Access", href: "/team", icon: Users },
      { label: "Organization Onboarding", href: "/onboarding", icon: UserPlus },
      { label: "MSSP Fleet & 2-Party JIT", href: "/partner/fleet", icon: Globe, tag: "2-PARTY", tagVariant: "anchored" },
      { label: "Developer & API", href: "/developer", icon: Code2 },
      { label: "Export & Offboarding", href: "/admin/export", icon: Download },
    ],
  },
  {
    id: "platform",
    label: "Platform Operator",
    items: [
      { label: "Operations & Entitlements", href: "/admin", icon: Sliders },
      { label: "Platform Service Health", href: "/admin/platform-health", icon: Activity },
      { label: "JIT Elevation Quorum", href: "/admin/jit-elevation", icon: KeyRound, tag: "4-EYES", tagVariant: "anchored" },
      { label: "Support Access JIT", href: "/admin/jit", icon: Lock },
      { label: "Email Templates", href: "/admin/email-templates", icon: Mail },
      { label: "G1 Launch Gate", href: "/admin/g1-gate", icon: Rocket },
      { label: "GTM Pre-Flight Checklist", href: "/admin/gtm-checklist", icon: CheckSquare },
    ],
  },
];

/**
 * Returns the nav entry that best matches `pathname` (longest href prefix wins), so
 * `/cases/incidents/command` resolves to Incident Command rather than Cases.
 */
export function findActiveNav(pathname: string): { group: NavGroup; item: NavItem } | null {
  let best: { group: NavGroup; item: NavItem } | null = null;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const matches =
        item.href === "/"
          ? pathname === "/"
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (matches && (!best || item.href.length > best.item.href.length)) {
        best = { group, item };
      }
    }
  }
  return best;
}
