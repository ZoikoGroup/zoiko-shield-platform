import React from "react";
import Image from "next/image";
import Link from "next/link";
import { ShieldCheck, ChartColumn, FileText, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Shared frame for /login and /register: full-bleed artwork, marketing hero on
 * the left, and a white tabbed card on the right.
 *
 * Colours are fixed hex values on purpose. The app's Tailwind palette is
 * theme-tokenised (light mode mirrors the scales and even flips `white`), and
 * this branded screen must look identical whatever theme was last chosen.
 */

export type AuthTab = "login" | "register" | "reset";

const TABS: { id: AuthTab; label: string; href: string }[] = [
  { id: "login", label: "Login", href: "/login" },
  { id: "register", label: "Register", href: "/register" },
  { id: "reset", label: "Reset Password", href: "/login?view=reset" },
];

const FEATURES = [
  { icon: ShieldCheck, label: ["Threat", "Detection"] },
  { icon: ChartColumn, label: ["Security", "Insights"] },
  { icon: FileText, label: ["Compliance", "& Governance"] },
  { icon: Globe, label: ["Global", "Protection"] },
];

const FOOTER_LINKS = [
  { label: "Privacy", href: "/trust" },
  { label: "Terms", href: "/trust" },
  { label: "Security", href: "/trust" },
  { label: "Accessibility", href: "/help" },
  { label: "Help", href: "/help" },
];

export const AUTH_FONT = "[font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe_UI',Roboto,sans-serif]";

export function AuthShell({
  activeTab,
  children,
}: {
  activeTab: AuthTab;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("relative min-h-screen w-full overflow-x-hidden bg-[#0b111c] text-[#0f172a] [color-scheme:light]", AUTH_FONT)}>
      <Image
        src="/images/auth/login-bg.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-[30%_center] pointer-events-none select-none"
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1440px] items-center justify-center gap-10 px-4 py-6 sm:px-8 lg:justify-between lg:px-[60px] lg:py-12">
        <AuthHero />

        <main className="w-full max-w-[448px] shrink-0 overflow-hidden rounded-[20px] bg-[#ffffff] shadow-[0_24px_60px_rgba(2,6,23,0.45)]">
          <nav aria-label="Account" className="grid grid-cols-3 border-b border-[#e2e8f0] bg-[#f8fafc] px-2 pt-2">
            {TABS.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  scroll={false}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "whitespace-nowrap rounded-t-xl border-b-2 px-1 py-2.5 text-center text-[13px] transition-colors sm:px-2 sm:text-sm",
                    isActive
                      ? "border-[#e31e24] bg-[#ffffff] font-semibold text-[#0f172a] shadow-[0_-1px_4px_rgba(15,23,42,0.06)]"
                      : "border-transparent text-[#64748b] hover:text-[#0f172a]"
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          <div className="px-6 pb-5 pt-7 sm:px-8">
            {children}

            <footer className="mt-5 border-t border-[#e2e8f0] pt-4 text-center">
              <ul className="flex flex-wrap items-center justify-center gap-y-1 text-xs text-[#64748b]">
                {FOOTER_LINKS.map((link, i) => (
                  <li key={link.label} className="flex items-center">
                    {i > 0 && <span className="mx-2.5 h-3 w-px bg-[#cbd5e1]" aria-hidden />}
                    <Link href={link.href} className="hover:text-[#0f172a]">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-[#94a3b8]">
                © {new Date().getFullYear()} Zoiko Shield. All rights reserved.
              </p>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}

/** Small logo + heading block at the top of each card view. */
export function AuthCardHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5 flex flex-col items-center text-center">
      <ZoikoLogo className="h-[36px] w-auto" />
      <h1 className="mt-3 text-[25px] font-bold leading-tight tracking-tight text-[#0f172a]">{title}</h1>
      <p className="mt-1.5 text-sm text-[#475569]">{subtitle}</p>
    </div>
  );
}

export function ZoikoLogo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/images/auth/zoiko-shield-logo.png"
      alt="Zoiko Shield"
      width={303}
      height={93}
      priority={priority}
      className={className}
    />
  );
}

function AuthHero() {
  return (
    <section className="hidden max-w-[680px] flex-1 flex-col self-stretch lg:flex">
      <ZoikoLogo priority className="h-auto w-[300px]" />

      <h2 className="mt-16 text-[56px] font-extrabold leading-[1.08] tracking-[-0.02em] text-[#0f172a] xl:text-[60px]">
        Stronger
        <br />
        security for a
        <br />
        <span className="text-[#e31e24]">safer tomorrow.</span>
      </h2>

      <p className="mt-8 max-w-[420px] text-lg leading-relaxed text-[#1e293b]">
        AI-powered security. Real-time intelligence. Complete protection.
      </p>

      <ul className="mt-6 grid max-w-[672px] grid-cols-4 gap-6 rounded-[36px] border border-[#ffffff]/50 bg-[#ffffff]/30 px-12 py-11 shadow-[0_8px_32px_rgba(15,23,42,0.12)] backdrop-blur-md">
        {FEATURES.map(({ icon: Icon, label }) => (
          <li key={label[0]} className="flex flex-col items-start gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#94a3b8]/60 bg-[#ffffff]/70">
              <Icon className="h-5 w-5 text-[#e31e24]" strokeWidth={2} />
            </span>
            <span className="text-[15px] font-semibold leading-snug text-[#0f172a]">
              {label[0]}
              <br />
              {label[1]}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-auto pt-10 inline-flex w-fit border-l-2 border-[#e31e24] bg-[#0f172a]/80 px-3 py-2.5 text-[11px] font-bold uppercase leading-[1.6] tracking-[0.3em] text-[#ffffff]">
        Trusted security.
        <br />
        Real world impact.
      </p>
    </section>
  );
}

/* ---------- Form primitives shared by the auth views ---------- */

export const authInputClass =
  "w-full rounded-xl border border-[#e2e8f0] bg-[#ffffff] px-4 py-2.5 text-sm text-[#0f172a] placeholder-[#94a3b8] outline-none transition focus:border-[#e31e24] focus:ring-4 focus:ring-[#e31e24]/10";

export function AuthLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-semibold text-[#0f172a]">
      {children}
    </label>
  );
}

export function AuthPrimaryButton({
  isLoading,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { isLoading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || isLoading}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-xl bg-[#e31e24] px-4 py-2.5 text-[15px] font-semibold text-[#ffffff] shadow-[0_8px_20px_rgba(227,30,36,0.28)] transition hover:bg-[#c8161c] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#e31e24]/30 disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
    >
      {isLoading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#ffffff]/40 border-t-[#ffffff]" aria-hidden />
      )}
      {children}
    </button>
  );
}

export function AuthAlert({
  tone,
  children,
}: {
  tone: "error" | "success" | "info";
  children: React.ReactNode;
}) {
  const tones = {
    error: "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]",
    success: "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]",
    info: "border-[#bfdbfe] bg-[#eff6ff] text-[#1e40af]",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-xl border px-4 py-3 text-[13px] leading-relaxed", tones[tone])}>
      {children}
    </div>
  );
}
