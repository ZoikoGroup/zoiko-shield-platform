import React from "react";

interface ZoikoShieldMarkProps {
  /** Size, shape and type size, for example "h-9 w-9 rounded-xl text-[13px]". */
  className?: string;
}

/**
 * The ZoikoShield "ZS" symbol, the same cyan-to-blue tile used in the app
 * sidebar and sign-in page. Colours are fixed so the host theme cannot shift
 * the brand mark, in light or dark.
 */
export function ZoikoShieldMark({ className = "h-9 w-9 rounded-xl text-[13px]" }: ZoikoShieldMarkProps) {
  return (
    <span
      aria-hidden="true"
      data-testid="zoikoshield-mark"
      className={[
        "inline-flex shrink-0 items-center justify-center bg-gradient-to-br from-[#22D3EE] via-[#06B6D4] to-[#2563EB]",
        "font-mono font-black leading-none tracking-tight text-[#020617] shadow-[0_0_18px_rgba(6,182,212,0.35)]",
        className,
      ].join(" ")}
    >
      ZS
    </span>
  );
}
