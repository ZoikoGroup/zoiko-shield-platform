"use client";

import React from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  ArrowRight,
  Calendar,
  Check,
  FileCheck2,
  Lock,
  MessageSquare,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Journey } from "./types";
import { ZoikoShieldMark } from "./ZoikoShieldMark";

const AssistantPanel = dynamic(
  () => import("./AssistantPanel").then((module) => module.AssistantPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[min(720px,calc(100dvh-140px))] w-full max-w-[430px] flex-col overflow-hidden rounded-2xl border border-[var(--pa-D8E2EC,#D8E2EC)] bg-[var(--pa-FFFFFF,#FFFFFF)] shadow-[0_24px_80px_rgba(11,44,68,0.22)]">
        <div className="h-[62px] bg-[var(--pa-0B2C44,#0B2C44)]" />
        <div className="flex flex-1 flex-col gap-4 px-5 py-6" aria-hidden="true">
          <div className="mx-auto h-12 w-12 animate-pulse rounded-2xl bg-[var(--pa-EAF1F7,#EAF1F7)]" />
          <div className="mx-auto h-4 w-56 animate-pulse rounded bg-[var(--pa-EAF1F7,#EAF1F7)]" />
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="h-[96px] animate-pulse rounded-xl bg-[var(--pa-F4F7FA,#F4F7FA)]" />
            ))}
          </div>
        </div>
      </div>
    ),
  },
);

function scrollToAssistant() {
  document.getElementById("assistant")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function openFlow(journey: Journey) {
  window.dispatchEvent(new CustomEvent("zoiko-assistant-flow", { detail: journey }));
  scrollToAssistant();
}

function ask(prompt: string) {
  window.dispatchEvent(new CustomEvent("zoiko-assistant-ask", { detail: prompt }));
  scrollToAssistant();
}

function focusComposer() {
  scrollToAssistant();
  window.setTimeout(() => document.getElementById("pa-composer")?.focus(), 350);
}

const CAPABILITIES = [
  {
    icon: <ShieldCheck className="h-5 w-5" aria-hidden="true" />,
    title: "Threat detection",
    body: "Correlate endpoint, identity, network and cloud telemetry into alerts with the context an analyst needs.",
    prompt: "How does ZoikoShield detect threats?",
  },
  {
    icon: <Activity className="h-5 w-5" aria-hidden="true" />,
    title: "Investigation",
    body: "Keep the timeline, evidence and decisions together in a case that can be reviewed after the fact.",
    prompt: "How does ZoikoShield support incident response?",
  },
  {
    icon: <FileCheck2 className="h-5 w-5" aria-hidden="true" />,
    title: "Evidence and audit",
    body: "Assemble period evidence and support offline verification of package integrity.",
    prompt: "How does ZoikoShield support compliance with evidence?",
  },
];

const TRUST_POINTS = [
  {
    icon: <Lock className="h-4 w-4" aria-hidden="true" />,
    title: "No customer-environment access",
    body: "The public assistant cannot see tenants, alerts, cases, evidence or response controls.",
  },
  {
    icon: <FileCheck2 className="h-4 w-4" aria-hidden="true" />,
    title: "Grounded in approved content",
    body: "Answers use reviewed public content and show the source they came from.",
  },
  {
    icon: <Sparkles className="h-4 w-4" aria-hidden="true" />,
    title: "Human routes stay open",
    body: "Demos, support and trust requests have deterministic routes and durable receipts.",
  },
];

export function AssistantHome() {
  return (
    <div className="min-h-screen bg-[var(--pa-F5F8FB,#F5F8FB)] text-[var(--pa-t-0B2C44,#0B2C44)]">
      <header className="sticky top-0 z-30 border-b border-[var(--pa-E3EAF2,#E3EAF2)] bg-[#FFFFFF]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]">
            <ZoikoShieldMark className="h-9 w-9 rounded-xl text-[13px]" />
            <span className="text-[15px] font-semibold tracking-[-0.02em]">ZoikoShield</span>
          </a>

          <nav aria-label="Public" className="hidden items-center gap-6 md:flex">
            <a href="#capabilities" className="text-[12.5px] font-medium text-[var(--pa-t-52677A,#52677A)] hover:text-[var(--pa-t-0B2C44,#0B2C44)]">
              Platform
            </a>
            <a href="#assistant" className="text-[12.5px] font-medium text-[var(--pa-t-52677A,#52677A)] hover:text-[var(--pa-t-0B2C44,#0B2C44)]">
              Assistant
            </a>
            <a href="#trust" className="text-[12.5px] font-medium text-[var(--pa-t-52677A,#52677A)] hover:text-[var(--pa-t-0B2C44,#0B2C44)]">
              Trust
            </a>
            <button
              type="button"
              onClick={() => openFlow("support")}
              className="text-[12.5px] font-medium text-[var(--pa-t-52677A,#52677A)] hover:text-[var(--pa-t-0B2C44,#0B2C44)]"
            >
              Support
            </button>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <a
              href="/login"
              className="hidden min-h-[38px] items-center rounded-lg px-3 text-[12.5px] font-semibold text-[var(--pa-t-334E63,#334E63)] hover:bg-[var(--pa-F1F5F9,#F1F5F9)] sm:inline-flex"
            >
              Sign in
            </a>
            <button
              type="button"
              onClick={() => openFlow("demo")}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[var(--pa-C04044,#C04044)] px-3.5 text-[12.5px] font-semibold text-[#FFFFFF] transition hover:bg-[var(--pa-A72F34,#A72F34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)] focus-visible:ring-offset-2"
            >
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              Book a demo
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_20%_0%,rgba(16,56,72,0.08),transparent_70%)]"
          />
          <div className="relative mx-auto grid max-w-[1240px] items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_460px] lg:py-16">
            <div className="max-w-[560px]">
              <p className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pa-D8E2EC,#D8E2EC)] bg-[var(--pa-FFFFFF,#FFFFFF)] px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--pa-t-52677A,#52677A)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--pa-C04044,#C04044)]" aria-hidden="true" />
                AI-assisted • Public information
              </p>
              <h1 className="mt-4 text-[36px] font-semibold leading-[1.08] tracking-[-0.035em] text-[var(--pa-t-0B2C44,#0B2C44)] sm:text-[46px]">
                Security clarity,
                <br />
                one question away.
              </h1>
              <p className="mt-4 max-w-[480px] text-[15px] leading-6 text-[var(--pa-t-52677A,#52677A)]">
                Ask the ZoikoShield AI Assistant about detection, investigation, integrations, compliance or
                plans. It answers from approved public content, cites its sources and hands you to a human
                when the question needs one.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={focusComposer}
                  className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-[var(--pa-103848,#103848)] px-5 text-[13px] font-semibold text-[#FFFFFF] transition hover:bg-[var(--pa-0B2C44,#0B2C44)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)] focus-visible:ring-offset-2"
                >
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  Start a conversation
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => ask("What is ZoikoShield and what does the platform do?")}
                  className="inline-flex min-h-[46px] items-center gap-1.5 rounded-xl border border-[var(--pa-D8E2EC,#D8E2EC)] bg-[var(--pa-FFFFFF,#FFFFFF)] px-4 text-[13px] font-semibold text-[var(--pa-t-103848,#103848)] transition hover:border-[var(--pa-9FB3C8,#9FB3C8)] hover:bg-[var(--pa-F9FBFD,#F9FBFD)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]"
                >
                  Explore capabilities
                </button>
              </div>

              <ul className="mt-7 space-y-2">
                {[
                  "Answers from reviewed public content, with sources",
                  "No access to customer environments or live incidents",
                  "Durable intake for demos, support and trust requests",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[12.5px] leading-5 text-[var(--pa-t-52677A,#52677A)]">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--pa-E8F5EC,#E8F5EC)] text-[var(--pa-t-1D7A43,#1D7A43)]">
                      <Check className="h-2.5 w-2.5" aria-hidden="true" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div id="assistant" className="flex justify-center lg:justify-end">
              <AssistantPanel embedded />
            </div>
          </div>
        </section>

        <section id="capabilities" className="border-y border-[var(--pa-E3EAF2,#E3EAF2)] bg-[var(--pa-FFFFFF,#FFFFFF)]">
          <div className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--pa-t-C04044,#C04044)]">
                  Platform capabilities
                </p>
                <h2 className="mt-1.5 text-[25px] font-semibold tracking-[-0.03em] text-[var(--pa-t-0B2C44,#0B2C44)]">
                  Built for security operations
                </h2>
              </div>
              <p className="max-w-[420px] text-[12.5px] leading-5 text-[var(--pa-t-63798C,#63798C)]">
                Public descriptions are capability statements. Contracted scope and service levels are
                confirmed with the team for your environment.
              </p>
            </div>

            <div className="mt-7 grid gap-4 md:grid-cols-3">
              {CAPABILITIES.map((item) => (
                <article
                  key={item.title}
                  className="flex flex-col rounded-2xl border border-[var(--pa-E1E8F0,#E1E8F0)] bg-[var(--pa-F9FBFD,#F9FBFD)] p-5"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--pa-EAF1F7,#EAF1F7)] text-[var(--pa-t-103848,#103848)]">
                    {item.icon}
                  </span>
                  <h3 className="mt-3 text-[15px] font-semibold text-[var(--pa-t-0B2C44,#0B2C44)]">{item.title}</h3>
                  <p className="mt-1.5 flex-1 text-[12.5px] leading-5 text-[var(--pa-t-52677A,#52677A)]">{item.body}</p>
                  <button
                    type="button"
                    onClick={() => ask(item.prompt)}
                    className="mt-4 inline-flex min-h-[38px] items-center gap-1.5 self-start rounded-lg border border-[var(--pa-D8E2EC,#D8E2EC)] bg-[var(--pa-FFFFFF,#FFFFFF)] px-3 text-[11.5px] font-semibold text-[var(--pa-t-103848,#103848)] hover:border-[var(--pa-9FB3C8,#9FB3C8)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]"
                  >
                    Ask the assistant
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="trust" className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6">
          <div className="rounded-2xl border border-[var(--pa-D8E2EC,#D8E2EC)] bg-[var(--pa-0B2C44,#0B2C44)] p-6 text-[#FFFFFF] sm:p-8">
            <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--pa-t-F2A6A8,#F2A6A8)]">
                  Public boundary
                </p>
                <h2 className="mt-2 text-[26px] font-semibold leading-[1.15] tracking-[-0.03em]">
                  A public assistant, not a back door.
                </h2>
                <p className="mt-3 max-w-[440px] text-[13px] leading-5 text-[#FFFFFF]/70">
                  The assistant is a separate public surface. It cannot read tenant data, open incidents,
                  approve response actions, book a meeting or promise a price. When a question needs a human,
                  it gives you the route.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openFlow("trust")}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-[var(--pa-FFFFFF,#FFFFFF)] px-4 text-[12.5px] font-semibold text-[var(--pa-t-0B2C44,#0B2C44)] hover:bg-[var(--pa-F1F5F9,#F1F5F9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-F2A6A8,#F2A6A8)]"
                  >
                    Request trust access
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => ask("What certifications and audit reports does ZoikoShield have?")}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-[#FFFFFF]/25 px-4 text-[12.5px] font-semibold text-[#FFFFFF] hover:bg-[#FFFFFF]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-F2A6A8,#F2A6A8)]"
                  >
                    Ask about compliance
                  </button>
                </div>
              </div>

              <div className="grid gap-3">
                {TRUST_POINTS.map((point) => (
                  <div key={point.title} className="flex gap-3 rounded-xl border border-[#FFFFFF]/12 bg-[#FFFFFF]/5 p-3.5">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FFFFFF]/10 text-[var(--pa-t-F2A6A8,#F2A6A8)]">
                      {point.icon}
                    </span>
                    <div>
                      <h3 className="text-[12.5px] font-semibold text-[#FFFFFF]">{point.title}</h3>
                      <p className="mt-0.5 text-[11.5px] leading-4 text-[#FFFFFF]/65">{point.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--pa-E3EAF2,#E3EAF2)] bg-[var(--pa-FFFFFF,#FFFFFF)]">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2.5">
            <ZoikoShieldMark className="h-7 w-7 rounded-lg text-[10px]" />
            <span className="text-[11.5px] text-[var(--pa-t-63798C,#63798C)]">
              ZoikoShield — public AI assistant. Not a substitute for your contracted support channel.
            </span>
          </div>
          <div className="flex items-center gap-4 text-[11.5px] font-medium text-[var(--pa-t-52677A,#52677A)]">
            <a href="#trust" className="hover:text-[var(--pa-t-0B2C44,#0B2C44)]">
              Trust
            </a>
            <a href="/login" className="hover:text-[var(--pa-t-0B2C44,#0B2C44)]">
              Sign in
            </a>
            <a href="#assistant" className="hover:text-[var(--pa-t-0B2C44,#0B2C44)]">
              Assistant
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
