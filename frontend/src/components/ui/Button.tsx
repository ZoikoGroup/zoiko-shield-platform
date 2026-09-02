import React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "outline" | "ghost" | "ai" | "cyan";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  isLoading = false,
  className,
  children,
  disabled,
  ...props
}) => {
  const getVariant = () => {
    switch (variant) {
      case "primary":
        return "bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.35)] border border-cyan-400/40";
      case "cyan":
        return "bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/50 hover:border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]";
      case "secondary":
        return "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700";
      case "danger":
        return "bg-rose-600/90 hover:bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.35)] border border-rose-500/40";
      case "outline":
        return "bg-transparent hover:bg-slate-800/60 text-slate-300 border border-slate-700 hover:border-slate-500";
      case "ghost":
        return "bg-transparent hover:bg-slate-800/40 text-slate-400 hover:text-slate-200";
      case "ai":
        return "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-[0_0_18px_rgba(168,85,247,0.4)] border border-purple-400/50";
      default:
        return "bg-slate-800 text-white";
    }
  };

  const getSize = () => {
    switch (size) {
      case "sm":
        return "px-3 py-1.5 text-xs rounded-lg";
      case "lg":
        return "px-6 py-3 text-base rounded-xl font-semibold";
      default:
        return "px-4 py-2 text-sm rounded-lg font-medium";
    }
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none font-sans",
        getVariant(),
        getSize(),
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
};
