import React, { useEffect } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = "lg",
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "auto";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getMaxWidth = () => {
    switch (maxWidth) {
      case "sm":
        return "max-w-sm";
      case "md":
        return "max-w-md";
      case "xl":
        return "max-w-2xl";
      case "2xl":
        return "max-w-4xl";
      default:
        return "max-w-lg";
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={cn(
          "w-full my-auto max-h-[calc(100vh-3rem)] flex flex-col bg-[#11141c] border border-cyan-500/30 rounded-2xl p-5 sm:p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative text-slate-100",
          getMaxWidth()
        )}
      >
        <div className="flex items-start justify-between pb-3 sm:pb-4 border-b border-slate-800 shrink-0">
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-slate-100 flex items-center gap-2">
              {title}
            </h3>
            {description && (
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="mt-4 overflow-y-auto flex-1 pr-1">{children}</div>
      </div>
    </div>
  );
};
