"use client";

import { useCallback, useState } from "react";
import type { WaterDocumentState } from "@hydrodocai/shared";
import { getApiUrl } from "../lib/getApiUrl";

export interface ResumeStreamState {
  status: "idle" | "streaming" | "done" | "error";
  errorMessage: string | null;
  state: Partial<WaterDocumentState> | null;
  /** Current graph node during resume stream; matches backend node_start/node_end for step indicator. */
  currentNode: string | null;
}

export function useResumeStream() {
  const [resumeState, setResumeState] = useState<ResumeStreamState>({
    status: "idle",
    errorMessage: null,
    state: null,
    currentNode: null,
  });

  const resume = useCallback(
    async (payload: { threadId: string; approved: boolean; documentContent?: string }) => {
      setResumeState((s) => ({ ...s, status: "streaming", errorMessage: null, currentNode: null }));

      const base = getApiUrl();
      const res = await fetch(`${base}/api/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok || !res.body) {
        setResumeState((s) => ({
          ...s,
          status: "error",
          errorMessage: res.statusText || "Resume failed",
        }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventType = "state_update";
      /** Accumulate state in closure so final state is not lost to React batching (same as useGenerateStream). */
      let accumulatedState: Partial<WaterDocumentState> | null = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
              continue;
            }
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6)) as {
                  state?: Partial<WaterDocumentState>;
                  message?: string;
                  node?: string;
                };
                if (eventType === "node_start") {
                  if (data.state != null) accumulatedState = accumulatedState ? { ...accumulatedState, ...data.state } : { ...data.state };
                  setResumeState((s) => ({
                    ...s,
                    currentNode: data.node ?? null,
                    state: data.state != null ? { ...s.state, ...data.state } : s.state,
                  }));
                } else if (eventType === "node_end" || eventType === "state_update") {
                  if (data.state != null) accumulatedState = accumulatedState ? { ...accumulatedState, ...data.state } : { ...data.state };
                  setResumeState((s) => ({
                    ...s,
                    currentNode: eventType === "node_end" ? (data.node ?? s.currentNode) : s.currentNode,
                    state: data.state != null ? { ...s.state, ...data.state } : s.state,
                  }));
                } else if (eventType === "done") {
                  const finalState = accumulatedState ? { ...accumulatedState, status: "completed" as const } : { status: "completed" as const };
                  setResumeState((s) => ({
                    ...s,
                    status: "done",
                    currentNode: null,
                    state: finalState,
                  }));
                  return;
                } else if (eventType === "error") {
                  setResumeState((s) => ({
                    ...s,
                    status: "error",
                    currentNode: null,
                    errorMessage: data.message ?? "Unknown error",
                  }));
                  return;
                }
              } catch {
                // ignore
              }
            }
          }
        }
        const finalState = accumulatedState ? { ...accumulatedState, status: "completed" as const } : { status: "completed" as const };
        setResumeState((s) => ({ ...s, status: "done", currentNode: null, state: finalState }));
      } catch (err) {
        setResumeState((s) => ({
          ...s,
          status: "error",
          errorMessage: err instanceof Error ? err.message : "Stream error",
        }));
      }
    },
    []
  );

  const reset = useCallback(() => {
    setResumeState({ status: "idle", errorMessage: null, state: null, currentNode: null });
  }, []);

  return { resumeState, resume, reset };
}
