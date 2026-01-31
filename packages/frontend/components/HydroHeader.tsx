"use client";

import { Droplets } from "lucide-react";
import { AgentStatusBadge } from "./AgentStatusBadge";

/**
 * HydroDoc standard page header per 400-hydro-ui-design-system.
 */
export function HydroHeader({
  currentNode,
  isStreaming,
}: {
  currentNode: string | null;
  isStreaming: boolean;
}) {
  return (
    <header className="w-full border-b border-slate-200 bg-white px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="rounded-hydro bg-water-blue p-1.5">
            <Droplets className="h-6 w-6 text-white" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">水政通 HydroDoc AI</h1>
            <p className="text-xs text-slate-500">水政监察公文智能辅助系统</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <AgentStatusBadge currentNode={currentNode} isStreaming={isStreaming} />
        </div>
      </div>
    </header>
  );
}
