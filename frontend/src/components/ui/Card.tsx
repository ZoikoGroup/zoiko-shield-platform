import React from "react";
import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "cyber" | "ai" | "glass";
  glow?: boolean;
}

export const Card: React.FC<CardProps> = ({
  variant = "default",
  glow = false,
  className,
  children,
  ...props
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case "cyber":
        return "bg-[#11141c]/90 border border-cyan-500/20 shadow-[0_4px_24px_rgba(0,0,0,0.5)]";
      case "ai":
        return "bg-gradient-to-b from-purple-950/30 to-[#0e1017]/90 border border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.15)]";
      case "glass":
        return "bg-slate-900/60 backdrop-blur-md border border-slate-800/80 shadow-xl";
      default:
        return "bg-[#10131a] border border-slate-800 shadow-md";
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl p-5 transition-all",
        getVariantStyles(),
        glow && "hover:border-cyan-500/40 hover:shadow-[0_0_24px_rgba(6,182,212,0.15)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
