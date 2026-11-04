"use client";

import React, { forwardRef } from "react";
import { MessageSquare } from "lucide-react";
import { COPY } from "./copy";
import { ZoikoShieldMark } from "./ZoikoShieldMark";

interface AssistantLauncherProps {
  onClick: () => void;
  expanded?: boolean;
}

export const AssistantLauncher = forwardRef<HTMLButtonElement, AssistantLauncherProps>(
  function AssistantLauncher({ onClick, expanded = false }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        aria-label={COPY.launcherLabel}
        aria-expanded={expanded}
        aria-controls="zoiko-public-assistant-panel"
        data-testid="assistant-launcher"
        className="group flex h-14 w-14 items-center justify-center rounded-full shadow-[0_12px_36px_rgba(6,182,212,0.4)] ring-1 ring-[#FFFFFF]/30 transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)] focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <span className="relative flex items-center justify-center">
          <ZoikoShieldMark className="h-14 w-14 rounded-full text-[19px]" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[var(--pa-0B2C44,#0B2C44)] bg-[var(--pa-C04044,#C04044)]">
            <MessageSquare className="h-2 w-2 text-[#FFFFFF]" aria-hidden="true" />
          </span>
        </span>
      </button>
    );
  },
);
