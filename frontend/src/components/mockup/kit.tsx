"use client";

/**
 * Shared building blocks for the v3.2 workspace screens.
 *
 * Every redesigned page composes from these so the 25 screens stay visually
 * consistent with the Command Center / Detection & Alerts / Case Workspace
 * references. Tone names are semantic (good / warn / bad) rather than raw
 * colours so a status reads the same way on every screen.
 */

import React from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, Search } from "lucide-react";

export type Tone = "cyan" | "emerald" | "amber" | "rose" | "purple" | "slate" | "blue";

const TEXT: Record<Tone, string> = {
  cyan: "text-cyan-300",
  emerald: "text-emerald-300",
  amber: "text-amber-300",
  rose: "text-rose-300",
  purple: "text-purple-300",
  slate: "text-slate-300",
  blue: "text-sky-300",
};
const PILL: Record<Tone, string> = {
  cyan: "bg-cyan-950/60 border-cyan-500/40 text-cyan-300",
  emerald: "bg-emerald-950/60 border-emerald-500/40 text-emerald-300",
  amber: "bg-amber-950/60 border-amber-500/40 text-amber-300",
  rose: "bg-rose-950/60 border-rose-500/40 text-rose-300",
  purple: "bg-purple-950/60 border-purple-500/40 text-purple-300",
  slate: "bg-slate-900/80 border-slate-700 text-slate-300",
  blue: "bg-sky-950/60 border-sky-500/40 text-sky-300",
};
const BAR: Record<Tone, string> = {
  cyan: "bg-cyan-400",
  emerald: "bg-emerald-400",
  amber: "bg-amber-400",
  rose: "bg-rose-400",
  purple: "bg-purple-400",
  slate: "bg-slate-500",
  blue: "bg-sky-400",
};
const DOT = BAR;

export function toneText(tone: Tone) {
  return TEXT[tone];
}

/* ------------------------------------------------------------------ header */

export function PageHeader({
  icon,
  eyebrow,
  title,
  subtitle,
  routeTag,
  actions,
}: {
  icon?: React.ReactNode;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  routeTag?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <div className="w-11 h-11 shrink-0 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-300">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-[10px] font-mono font-bold tracking-wider uppercase text-cyan-400 mb-0.5">
              {eyebrow}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-slate-100 tracking-tight">{title}</h1>
            {routeTag && (
              <span className="px-2 py-0.5 rounded-md border border-cyan-500/40 bg-cyan-950/40 text-[10px] font-mono text-cyan-300">
                {routeTag}
              </span>
            )}
          </div>
          {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function ActionButton({
  children,
  primary,
  disabled,
  onClick,
  title,
}: {
  children: React.ReactNode;
  primary?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
        disabled
          ? "bg-slate-900/60 border-slate-800 text-slate-500 cursor-not-allowed"
          : primary
            ? "bg-sky-600 hover:bg-sky-500 border-sky-500 text-white"
            : "bg-raised hover:bg-overlay border-line-strong text-slate-200",
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ banner */

export function NoticeBanner({
  tone = "amber",
  title,
  body,
  tag,
  icon,
}: {
  tone?: Tone;
  title: string;
  body?: React.ReactNode;
  tag?: string;
  icon?: React.ReactNode;
}) {
  const frame: Partial<Record<Tone, string>> = {
    rose: "bg-rose-950/30 border-rose-500/40",
    amber: "bg-amber-950/30 border-amber-500/40",
    cyan: "bg-cyan-950/30 border-cyan-500/40",
    emerald: "bg-emerald-950/30 border-emerald-500/40",
  };
  return (
    <div
      role="note"
      className={cn(
        "flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border px-4 py-3",
        frame[tone] || frame.amber,
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className={cn("mt-0.5 shrink-0", TEXT[tone])}>{icon || <AlertTriangle className="w-4 h-4" />}</div>
        <div className="min-w-0">
          <div className={cn("text-xs font-bold uppercase tracking-wide", TEXT[tone])}>{title}</div>
          {body && <div className="text-[11px] text-slate-300 mt-0.5">{body}</div>}
        </div>
      </div>
      {tag && <Pill tone={tone}>{tag}</Pill>}
    </div>
  );
}

/* --------------------------------------------------------------------- KPI */

export interface Kpi {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tag?: string;
  tone?: Tone;
  icon?: React.ReactNode;
}

export function KpiGrid({ items }: { items: Kpi[] }) {
  const cols =
    items.length >= 5 ? "lg:grid-cols-5" : items.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3";
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3", cols)}>
      {items.map((k) => (
        <KpiCard key={k.label} {...k} />
      ))}
    </div>
  );
}

export function KpiCard({ label, value, hint, tag, tone = "cyan", icon }: Kpi) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-raised border border-line p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] text-slate-400 min-w-0">
          {icon ? <span className={TEXT[tone]}>{icon}</span> : <span className={cn("w-2 h-2 rounded-full shrink-0", DOT[tone])} />}
          <span className="truncate">{label}</span>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2 mt-2">
        <div className="text-2xl md:text-3xl font-extrabold text-slate-100 font-mono tracking-tight tabular-nums">{value}</div>
        {tag && <span className={cn("text-[10px] font-mono font-bold uppercase text-right", TEXT[tone])}>{tag}</span>}
      </div>
      {hint && <div className="text-[11px] text-slate-500 mt-1">{hint}</div>}
      <div className={cn("absolute left-0 right-0 bottom-0 h-0.5 opacity-80", BAR[tone])} />
    </div>
  );
}

/* ----------------------------------------------------------------- layout */

export function Panel({
  title,
  meta,
  metaTone = "cyan",
  children,
  className,
  bodyClassName,
}: {
  title: string;
  meta?: string;
  metaTone?: Tone;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-xl bg-raised border border-line flex flex-col min-w-0", className)}>
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
        <h2 className="text-sm font-bold text-slate-100">{title}</h2>
        {meta && <span className={cn("text-[10px] font-mono", TEXT[metaTone])}>{meta}</span>}
      </header>
      <div className={cn("p-4 flex-1 min-w-0", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Pill({ tone = "slate", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-mono font-bold uppercase whitespace-nowrap",
        PILL[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export interface TabDef {
  id: string;
  label: string;
}

export function TabBar({ tabs, active, onChange }: { tabs: TabDef[]; active: string; onChange: (id: string) => void }) {
  return (
    <div role="tablist" className="flex items-center gap-1.5 overflow-x-auto pb-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            "px-3.5 py-2 rounded-lg text-xs font-semibold border whitespace-nowrap transition-colors",
            active === t.id
              ? "bg-sky-600 border-sky-500 text-white"
              : "bg-raised border-line text-slate-300 hover:text-white hover:border-slate-600",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex items-center gap-2 flex-1 min-w-[180px] px-3 py-2 rounded-lg bg-surface border border-line text-xs text-slate-300">
      <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="bg-transparent outline-none w-full placeholder:text-slate-500"
      />
    </label>
  );
}

/* ------------------------------------------------------------------ table */

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  selectedKey,
  onSelect,
  empty = "No records match the current filters.",
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  selectedKey?: string;
  onSelect?: (row: T) => void;
  empty?: string;
}) {
  return (
    <div className="overflow-x-auto -mx-4">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-slate-500 border-b border-line">
            {columns.map((c) => (
              <th key={c.key} className={cn("px-4 py-2 font-semibold whitespace-nowrap", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6 text-center text-slate-500">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const k = rowKey(r);
              const selected = selectedKey === k;
              return (
                <tr
                  key={k}
                  onClick={onSelect ? () => onSelect(r) : undefined}
                  className={cn(
                    "border-b border-line last:border-0",
                    onSelect && "cursor-pointer hover:bg-overlay",
                    selected && "bg-sky-950/40 shadow-[inset_3px_0_0_#38bdf8]",
                  )}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-4 py-2.5 text-slate-300 align-middle", c.className)}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------- lists & flows */

export interface EventItem {
  time?: string;
  title: string;
  sub?: string;
  tag?: string;
  tone?: Tone;
}

export function EventList({ items }: { items: EventItem[] }) {
  return (
    <ul className="space-y-3">
      {items.map((e, i) => (
        <li key={`${e.title}-${i}`} className="flex items-start gap-3">
          <span className={cn("mt-1.5 w-2 h-2 rounded-full shrink-0", DOT[e.tone || "cyan"])} />
          {e.time && <span className="text-[11px] font-mono text-slate-500 w-12 shrink-0 mt-0.5">{e.time}</span>}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-200">{e.title}</div>
            {e.sub && <div className="text-[11px] text-slate-500 mt-0.5">{e.sub}</div>}
          </div>
          {e.tag && <span className={cn("text-[10px] font-mono font-bold uppercase shrink-0", TEXT[e.tone || "slate"])}>{e.tag}</span>}
        </li>
      ))}
    </ul>
  );
}

export interface Step {
  label: string;
  sub?: string;
  state: "done" | "active" | "pending" | "blocked";
}

export function StepFlow({ steps }: { steps: Step[] }) {
  const ring: Record<Step["state"], string> = {
    done: "border-emerald-400 text-emerald-300 bg-emerald-950/50",
    active: "border-amber-400 text-amber-300 bg-amber-950/50",
    pending: "border-slate-600 text-slate-400 bg-slate-900",
    blocked: "border-rose-500 text-rose-300 bg-rose-950/50",
  };
  return (
    <ol className="flex flex-wrap items-start gap-y-4">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-start flex-1 min-w-[96px]">
          <div className="flex flex-col items-center text-center flex-1">
            <span className={cn("w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold", ring[s.state])}>
              {s.state === "done" ? "✓" : i + 1}
            </span>
            <span className="text-[11px] font-semibold text-slate-200 mt-1.5">{s.label}</span>
            {s.sub && <span className="text-[10px] text-slate-500">{s.sub}</span>}
          </div>
          {i < steps.length - 1 && <span className="hidden sm:block h-px bg-slate-700 flex-1 mt-4 -mx-6" />}
        </li>
      ))}
    </ol>
  );
}

export function NumberedList({
  items,
}: {
  items: { title: string; sub?: string; tag?: string; tone?: Tone }[];
}) {
  return (
    <ol className="space-y-2.5">
      {items.map((it, i) => (
        <li key={it.title} className="flex items-start gap-3">
          <span className="w-6 h-6 shrink-0 rounded-md border border-line-strong bg-surface text-[11px] font-bold text-slate-300 flex items-center justify-center">
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-200">{it.title}</div>
            {it.sub && <div className="text-[11px] text-slate-500">{it.sub}</div>}
          </div>
          {it.tag && <Pill tone={it.tone || "slate"}>{it.tag}</Pill>}
        </li>
      ))}
    </ol>
  );
}

export function KeyValues({
  items,
  cols = 2,
}: {
  items: { k: string; v: React.ReactNode; tone?: Tone }[];
  cols?: 1 | 2 | 3;
}) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3", cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3")}>
      {items.map((i) => (
        <div key={i.k} className="min-w-0">
          <dt className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{i.k}</dt>
          <dd className={cn("text-xs font-semibold mt-0.5 break-words", i.tone ? TEXT[i.tone] : "text-slate-200")}>{i.v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProgressRow({
  label,
  value,
  max = 100,
  display,
  tone = "cyan",
}: {
  label: string;
  value: number;
  max?: number;
  display?: string;
  tone?: Tone;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-slate-300">{label}</span>
        <span className="font-mono text-slate-400">{display ?? `${value} / ${max}`}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div className={cn("h-full rounded-full", BAR[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function CheckRow({
  label,
  sub,
  status,
  tone = "slate",
}: {
  label: string;
  sub?: string;
  status: string;
  tone?: Tone;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-line last:border-0">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-slate-200">{label}</div>
        {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
      </div>
      <span className={cn("text-[10px] font-mono font-bold uppercase shrink-0", TEXT[tone])}>{status}</span>
    </div>
  );
}

export function FooterStrip({ left, right, tone = "amber" }: { left: React.ReactNode; right?: React.ReactNode; tone?: Tone }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[11px]">
      <div className="flex items-center gap-2 text-slate-400">
        <AlertTriangle className={cn("w-3.5 h-3.5 shrink-0", TEXT[tone])} />
        <span>{left}</span>
      </div>
      {right && <span className={cn("font-mono font-bold uppercase", TEXT[tone])}>{right}</span>}
    </div>
  );
}

/* --------------------------------------------------------- page scaffold */

/**
 * Wraps a redesigned screen. `console` is the pre-existing, fully wired page
 * (live API calls, approval flows, verification). It stays mounted the whole
 * time so none of its state or effects change behaviour, and is shown when
 * the "Live console" tab is selected - nothing that already worked is lost.
 */
export function WorkspacePage({
  header,
  banner,
  kpis,
  tabs,
  activeTab,
  onTabChange,
  console,
  consoleLabel = "Live console",
  footer,
  children,
}: {
  header: React.ReactNode;
  banner?: React.ReactNode;
  kpis?: React.ReactNode;
  tabs: TabDef[];
  activeTab: string;
  onTabChange: (id: string) => void;
  console?: React.ReactNode;
  consoleLabel?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const allTabs = console ? [...tabs, { id: CONSOLE_TAB, label: consoleLabel }] : tabs;
  const onConsole = activeTab === CONSOLE_TAB;
  return (
    <div className="space-y-4">
      {header}
      {banner}
      {kpis}
      <TabBar tabs={allTabs} active={activeTab} onChange={onTabChange} />
      <div hidden={onConsole} className="space-y-4">
        {children}
        {footer}
      </div>
      {console && (
        <div hidden={!onConsole} data-testid="live-console">
          {console}
        </div>
      )}
    </div>
  );
}

export const CONSOLE_TAB = "live-console";

/** True when a panel tagged with `ids` belongs on the active tab. The first tab is the overview and shows everything. */
export function useTabFilter(activeTab: string, overviewId: string) {
  return (...ids: string[]) => activeTab === overviewId || ids.includes(activeTab);
}
