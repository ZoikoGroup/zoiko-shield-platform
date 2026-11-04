"use client";

import React from "react";
import {
  Activity,
  ArrowRight,
  Calendar,
  FileCheck2,
  LayoutGrid,
  Network,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type { AssistantConfig, Journey } from "./types";
import { COPY } from "./copy";
import { ZoikoShieldMark } from "./ZoikoShieldMark";

const TILE_ICONS: Record<string, React.ReactNode> = {
  detection: <ShieldAlert className="h-5 w-5" aria-hidden="true" />,
  platform: <LayoutGrid className="h-5 w-5" aria-hidden="true" />,
  incident: <Activity className="h-5 w-5" aria-hidden="true" />,
  integrations: <Network className="h-5 w-5" aria-hidden="true" />,
  compliance: <FileCheck2 className="h-5 w-5" aria-hidden="true" />,
  demo: <Calendar className="h-5 w-5" aria-hidden="true" />,
};

interface AssistantWelcomeProps {
  config: AssistantConfig;
  onPrompt: (prompt: string) => void;
  onFlow: (journey: Journey) => void;
}

export function AssistantWelcome({ config, onPrompt, onFlow }: AssistantWelcomeProps) {
  const copy = config.welcome;
  const tiles = config.topic_tiles ?? [];
  const suggested = config.suggested_questions ?? [];

  return (
    <div className="flex flex-col gap-5 px-5 pb-6 pt-5" data-testid="assistant-welcome">
      <div className="flex flex-col items-center text-center">
        <div className="relative mb-3 flex h-12 w-12 items-center justify-center">
          <ZoikoShieldMark className="h-12 w-12 rounded-2xl text-[16px]" />
          <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[var(--pa-FFFFFF,#FFFFFF)] bg-[var(--pa-C04044,#C04044)]" />
        </div>
        <h2 className="max-w-[320px] text-[22px] font-semibold leading-[1.25] tracking-[-0.02em] text-[var(--pa-t-0B2C44,#0B2C44)]">
          {copy.welcomeHeading || COPY.fallbackHeading}
        </h2>
        <p className="mt-2 max-w-[330px] text-[13.5px] leading-5 text-[var(--pa-t-52677A,#52677A)]">
          {copy.welcomeSupport || COPY.fallbackSupport}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5" aria-label="Assistant topics">
        {tiles.map((tile) => {
          const icon = TILE_ICONS[tile.id] ?? <ShieldCheck className="h-5 w-5" aria-hidden="true" />;
          const isDemo = tile.id === "demo";
          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => {
                if (tile.flow) onFlow(tile.flow as Journey);
                else onPrompt(tile.prompt);
              }}
              className={[
                "group flex min-h-[96px] flex-col items-start gap-2 rounded-xl border p-3 text-left transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)] focus-visible:ring-offset-2",
                isDemo
                  ? "border-[var(--pa-E9C8CA,#E9C8CA)] bg-[var(--pa-FFF8F8,#FFF8F8)] hover:border-[var(--pa-C04044,#C04044)] hover:bg-[var(--pa-FFF1F1,#FFF1F1)]"
                  : "border-[var(--pa-E1E8F0,#E1E8F0)] bg-[var(--pa-FFFFFF,#FFFFFF)] hover:border-[var(--pa-9FB3C8,#9FB3C8)] hover:bg-[var(--pa-F7FAFD,#F7FAFD)]",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-8 w-8 items-center justify-center rounded-lg",
                  isDemo ? "bg-[var(--pa-FBE3E4,#FBE3E4)] text-[var(--pa-t-A72F34,#A72F34)]" : "bg-[var(--pa-EAF1F7,#EAF1F7)] text-[var(--pa-t-103848,#103848)]",
                ].join(" ")}
              >
                {icon}
              </span>
              <span className="text-[13px] font-semibold leading-4 text-[var(--pa-t-0B2C44,#0B2C44)]">
                {tile.title}
              </span>
              <span className="text-[11.5px] leading-4 text-[var(--pa-t-63798C,#63798C)]">{tile.description}</span>
            </button>
          );
        })}
      </div>

      {suggested.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--pa-t-7B8FA2,#7B8FA2)]">
            {COPY.suggested}
          </p>
          <div className="flex flex-col gap-1.5">
            {suggested.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => onPrompt(question)}
                className="flex min-h-[40px] items-center justify-between gap-3 rounded-lg border border-transparent px-2.5 py-1.5 text-left text-[12.5px] text-[var(--pa-t-334E63,#334E63)] transition hover:border-[var(--pa-DCE5EE,#DCE5EE)] hover:bg-[var(--pa-F6F9FC,#F6F9FC)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]"
              >
                <span>{question}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--pa-t-8FA2B3,#8FA2B3)]" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
