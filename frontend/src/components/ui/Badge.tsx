import React from "react";
import { cn } from "@/lib/utils";
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  Lock,
  Radio,
  Server,
  Key,
} from "lucide-react";

export type BadgeVariant =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "pass"
  | "fail"
  | "pending"
  | "ai"
  | "anchored"
  | "simulated"
  | "active"
  | "healthy"
  | "neutral";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  showIcon?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = "neutral",
  children,
  className,
  showIcon = true,
}) => {
  const getStyles = () => {
    switch (variant) {
      case "critical":
        return {
          wrapper: "bg-rose-950/70 border-rose-500/50 text-rose-300",
          icon: <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />,
        };
      case "high":
        return {
          wrapper: "bg-amber-950/70 border-amber-500/50 text-amber-300",
          icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
        };
      case "medium":
        return {
          wrapper: "bg-yellow-950/70 border-yellow-500/50 text-yellow-300",
          icon: <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />,
        };
      case "low":
        return {
          wrapper: "bg-blue-950/70 border-blue-500/50 text-blue-300",
          icon: <Radio className="w-3.5 h-3.5 text-blue-400" />,
        };
      case "pass":
      case "healthy":
      case "active":
        return {
          wrapper: "bg-emerald-950/70 border-emerald-500/50 text-emerald-300",
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
        };
      case "fail":
        return {
          wrapper: "bg-red-950/70 border-red-500/50 text-red-300",
          icon: <ShieldAlert className="w-3.5 h-3.5 text-red-400" />,
        };
      case "pending":
        return {
          wrapper: "bg-slate-900/80 border-slate-700 text-slate-400",
          icon: <Clock className="w-3.5 h-3.5 text-slate-400" />,
        };
      case "ai":
        return {
          wrapper: "bg-purple-950/70 border-purple-500/50 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.25)]",
          icon: <Sparkles className="w-3.5 h-3.5 text-purple-400" />,
        };
      case "anchored":
        return {
          wrapper: "bg-cyan-950/70 border-cyan-500/50 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.2)]",
          icon: <Lock className="w-3.5 h-3.5 text-cyan-400" />,
        };
      case "simulated":
        return {
          wrapper: "bg-violet-950/70 border-violet-500/50 text-violet-300 border-dashed",
          icon: <Server className="w-3.5 h-3.5 text-violet-400" />,
        };
      default:
        return {
          wrapper: "bg-slate-900/80 border-slate-700 text-slate-300",
          icon: <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />,
        };
    }
  };

  const style = getStyles();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border font-mono tracking-wide backdrop-blur-sm transition-all",
        style.wrapper,
        className
      )}
    >
      {showIcon && style.icon}
      <span>{children}</span>
    </span>
  );
};
