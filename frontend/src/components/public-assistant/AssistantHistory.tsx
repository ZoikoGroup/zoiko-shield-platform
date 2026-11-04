"use client";

import React from "react";
import { ArrowLeft, MessageSquare, SquarePen, Trash2 } from "lucide-react";
import type { StoredConversation } from "./history";

interface AssistantHistoryProps {
  items: StoredConversation[];
  activeId: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onDeleteAll: () => void;
  onNewChat: () => void;
  onBack: () => void;
}

function when(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function AssistantHistory({
  items,
  activeId,
  onOpen,
  onDelete,
  onDeleteAll,
  onNewChat,
  onBack,
}: AssistantHistoryProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="assistant-history">
      <div className="flex items-center gap-2 border-b border-[var(--pa-EEF2F6,#EEF2F6)] px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to chat"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--pa-t-52677A,#52677A)] hover:bg-[var(--pa-F1F5F9,#F1F5F9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <h2 className="flex-1 text-[14px] font-semibold text-[var(--pa-t-0B2C44,#0B2C44)]">Chat history</h2>
        <button
          type="button"
          onClick={onNewChat}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[var(--pa-103848,#103848)] px-3 text-[12px] font-semibold text-[#FFFFFF] hover:bg-[var(--pa-0B2C44,#0B2C44)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)] focus-visible:ring-offset-2"
        >
          <SquarePen className="h-3.5 w-3.5" aria-hidden="true" />
          New chat
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--pa-EAF1F7,#EAF1F7)] text-[var(--pa-t-103848,#103848)]">
              <MessageSquare className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="text-[13px] font-semibold text-[var(--pa-t-0B2C44,#0B2C44)]">No saved conversations yet</p>
            <p className="max-w-[280px] text-[12px] leading-5 text-[var(--pa-t-52677A,#52677A)]">
              Conversations you finish are kept in this browser only, so you can come back to them.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5" aria-label="Saved conversations">
            {items.map((item) => (
              <li
                key={item.id}
                className={[
                  "group flex items-center gap-1 rounded-xl border pr-1",
                  item.id === activeId
                    ? "border-[var(--pa-9FB3C8,#9FB3C8)] bg-[var(--pa-F7FAFD,#F7FAFD)]"
                    : "border-[var(--pa-E1E8F0,#E1E8F0)] bg-[var(--pa-FFFFFF,#FFFFFF)]",
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => onOpen(item.id)}
                  className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left hover:bg-[var(--pa-F7FAFD,#F7FAFD)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]"
                >
                  <span className="w-full truncate text-[13px] font-semibold text-[var(--pa-t-0B2C44,#0B2C44)]">
                    {item.title}
                  </span>
                  <span className="text-[11px] text-[var(--pa-t-63798C,#63798C)]">
                    {Math.ceil(item.turns.length / 2)} {item.turns.length > 2 ? "questions" : "question"} • {when(item.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  aria-label={`Delete conversation: ${item.title}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--pa-t-8FA2B3,#8FA2B3)] hover:bg-[var(--pa-FFF1F1,#FFF1F1)] hover:text-[var(--pa-t-A72F34,#A72F34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--pa-EEF2F6,#EEF2F6)] bg-[var(--pa-FBFCFE,#FBFCFE)] px-4 py-2.5">
        <p className="text-[10px] leading-[1.45] text-[var(--pa-t-8FA2B3,#8FA2B3)]">
          Saved in this browser only. The assistant service does not keep your chats.
        </p>
        {items.length > 0 && (
          <button
            type="button"
            onClick={onDeleteAll}
            className="shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold text-[var(--pa-t-8FA2B3,#8FA2B3)] underline-offset-2 hover:text-[var(--pa-t-A72F34,#A72F34)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]"
          >
            Delete all
          </button>
        )}
      </div>
    </div>
  );
}
