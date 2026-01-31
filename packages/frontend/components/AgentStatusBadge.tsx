"use client";

import { Loader2 } from "lucide-react";

const NODE_LABELS: Record<string, string> = {
  draftNode: "起草中",
  legalVerificationNode: "法律核验",
  auditNode: "审计",
  humanReviewNode: "人工审核",
  exportNode: "导出中",
};

/**
 * Displays current LangGraph node status with subtle transition per design system.
 */
export function AgentStatusBadge({
  currentNode,
  isStreaming,
}: {
  currentNode: string | null;
  isStreaming: boolean;
}) {
  const label = currentNode ? NODE_LABELS[currentNode] ?? currentNode : null;
  return (
    <div
      className="flex items-center gap-2 rounded-hydro border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-opacity duration-300"
      role="status"
      aria-live="polite"
      aria-label={isStreaming ? `处理中：${label ?? "等待"}` : "就绪"}
    >
      {isStreaming && <Loader2 className="h-4 w-4 animate-spin text-water-blue" aria-hidden />}
      <span>{label ?? (isStreaming ? "处理中..." : "就绪")}</span>
    </div>
  );
}
