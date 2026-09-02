import React from "react";
import { TimelineEntry } from "@/lib/types";
import { formatTimestamp } from "@/lib/utils";
import { Card } from "@/ui/Card";
import {
  ShieldAlert,
  FolderOpen,
  Lock,
  Sparkles,
  UserCheck,
  Server,
  Zap,
} from "lucide-react";

interface CaseTimelineProps {
  timeline: TimelineEntry[];
}

export const CaseTimeline: React.FC<CaseTimelineProps> = ({ timeline }) => {
  const getIcon = (type: TimelineEntry["type"]) => {
    switch (type) {
      case "ALERT_TRIGGERED":
        return <ShieldAlert className="w-4 h-4 text-rose-400" />;
      case "CASE_OPENED":
        return <FolderOpen className="w-4 h-4 text-cyan-400" />;
      case "EVIDENCE_RECORDED":
        return <Lock className="w-4 h-4 text-emerald-400" />;
      case "AI_INVESTIGATED":
        return <Sparkles className="w-4 h-4 text-purple-400" />;
      case "DECISION_RECORDED":
        return <UserCheck className="w-4 h-4 text-amber-400" />;
      case "RESPONSE_SIMULATED":
        return <Server className="w-4 h-4 text-violet-400" />;
      default:
        return <Zap className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <h3 className="font-semibold text-slate-100 flex items-center gap-2">
            Append-Only Incident Timeline
          </h3>
          <p className="text-xs text-slate-400">
            Immutable chronological audit stream of all detections, evidence, and actions.
          </p>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
          {timeline.length} Entries
        </span>
      </div>

      <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
        {timeline.map((entry, idx) => (
          <div key={entry.id || idx} className="relative group">
            {/* Timeline node icon */}
            <div className="absolute -left-6 top-0.5 w-6 h-6 rounded-full bg-[#11141c] border border-slate-700 flex items-center justify-center shadow-md">
              {getIcon(entry.type)}
            </div>

            <div className="bg-[#141824]/60 border border-slate-800/80 rounded-xl p-3.5 space-y-1 hover:border-slate-700 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm text-slate-200">
                  {entry.title}
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {formatTimestamp(entry.timestamp)}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {entry.description}
              </p>
              <div className="pt-1 flex items-center gap-2 text-[10px] font-mono text-slate-500">
                <span>Actor: {entry.actor}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
