"use client";

/**
 * Skeleton for content preview area. Multi-line bars with animate-pulse, per 400-hydro-ui-design-system.
 */
export function ContentPreviewSkeleton({ lines = 6 }: { lines?: number }) {
  const widths = ["w-full", "w-11/12", "w-full", "w-4/5", "w-full", "w-10/12", "w-full", "w-3/4"];
  return (
    <div className="space-y-3 p-4" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={`h-4 rounded-hydro bg-slate-200 animate-pulse ${widths[i % widths.length]}`}
        />
      ))}
    </div>
  );
}
