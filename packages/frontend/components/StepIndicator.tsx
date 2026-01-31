"use client";

/** Exported for content preview and other UI that need node labels. */
export const STEPS: { key: string; label: string }[] = [
  { key: "draftNode", label: "起草" },
  { key: "legalVerificationNode", label: "法律核验" },
  { key: "auditNode", label: "审计" },
  { key: "humanReviewNode", label: "人工审核" },
  { key: "exportNode", label: "导出" },
];

/**
 * Step indicator with node names and subtle transition per design system.
 * When isStreaming and no node yet, first step (起草) is shown as "in progress".
 */
export function StepIndicator({
  currentNode,
  isCompleted,
  isStreaming,
}: {
  currentNode: string | null;
  isCompleted: boolean;
  isStreaming?: boolean;
}) {
  const resolvedIndex = currentNode
    ? STEPS.findIndex((s) => s.key === currentNode)
    : isStreaming
      ? 0
      : -1;
  const currentIndex = resolvedIndex >= 0 ? resolvedIndex : -1;
  return (
    <div className="flex flex-wrap items-center gap-2" role="progressbar" aria-valuenow={currentIndex + 1} aria-valuemin={0} aria-valuemax={STEPS.length} aria-label="当前流程节点">
      {STEPS.map((step, i) => {
        const isActive = currentIndex === i;
        const isPast = currentIndex > i || isCompleted;
        return (
          <span
            key={step.key}
            className={`inline-flex items-center gap-1 rounded-hydro border px-2 py-1 text-xs transition-all duration-300 ${
              isActive
                ? "border-water-blue bg-water-blue/10 text-water-blue font-medium"
                : isPast
                  ? "border-hydro-success/40 bg-hydro-success/5 text-slate-600"
                  : "border-slate-200 bg-white text-slate-400"
            }`}
          >
            {isPast && <span className="text-hydro-success" aria-hidden>✓</span>}
            {i + 1}. {step.label}
            {isActive && <span className="text-water-blue/80">(正在进行)</span>}
          </span>
        );
      })}
      {isCompleted && (
        <span className="inline-flex items-center rounded-hydro border border-hydro-success bg-hydro-success/10 px-2 py-1 text-xs text-hydro-success transition-opacity duration-300">
          已完成
        </span>
      )}
    </div>
  );
}
