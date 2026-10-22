import React from "react";
import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "cyber" | "ai" | "glass" | "well";
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
        return "bg-raised/95 border border-cyan-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.6)]";
      case "ai":
        return "bg-gradient-to-b from-purple-950/20 to-raised/95 border border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.12)]";
      case "glass":
        return "bg-raised/80 backdrop-blur-md border border-slate-800/90 shadow-xl";
      case "well":
        return "bg-surface border border-line";
      default:
        return "bg-raised border border-line shadow-[0_2px_12px_rgba(0,0,0,0.3)]";
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl p-5 transition-all duration-200",
        getVariantStyles(),
        glow && "hover:border-cyan-500/40 hover:shadow-[0_0_24px_rgba(6,182,212,0.14)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

