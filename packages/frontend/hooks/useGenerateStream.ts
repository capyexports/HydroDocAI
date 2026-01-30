"use client";

import { useCallback, useState } from "react";
import type { WaterDocumentState } from "@hydrodocai/shared";
import { getApiUrl } from "../lib/getApiUrl";

export type SSEEventType = "node_start" | "node_end" | "state_update" | "done" | "error";

export interface StreamState {
  currentNode: string | null;
  state: Partial<WaterDocumentState> | null;
  threadId: string | null;
  status: "idle" | "streaming" | "done" | "error";
  errorMessage: string | null;
}

export function useGenerateStream() {
  const [streamState, setStreamState] = useState<StreamState>({
    currentNode: null,
    state: null,
    threadId: null,
    status: "idle",
    errorMessage: null,
  });

  const startGenerate = useCallback(
    async (payload: { rawInput: string; documentType?: WaterDocumentState["documentType"]; threadId?: string }) => {
      setStreamState((s) => ({ ...s, status: "streaming", errorMessage: null }));

      const base = getApiUrl();
      let res: Response;
      try {
        res = await fetch(`${base}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawInput: payload.rawInput,
          documentType: payload.documentType,
          threadId: payload.threadId,
        }),
        });
      } catch (err) {
        const msg =
          err instanceof Error && err.message === "Failed to fetch"
            ? `无法连接后端 (${base})，请确认后端已启动`
            : err instanceof Error
              ? err.message
              : "Request failed";
        setStreamState((s) => ({ ...s, status: "error", errorMessage: msg }));
        return;
      }

      if (!res.ok || !res.body) {
        setStreamState((s) => ({
          ...s,
          status: "error",
          errorMessage: res.statusText || "Request failed",
        }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventType: SSEEventType = "state_update";
      let threadId: string | null = null;

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
              eventType = line.slice(7).trim() as SSEEventType;
              continue;
            }
            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6);
              try {
                const data = JSON.parse(dataStr) as {
                  threadId?: string;
                  node?: string;
                  state?: Partial<WaterDocumentState>;
                  message?: string;
                };
                if (data.threadId) threadId = data.threadId;

                if (eventType === "node_start") {
                  setStreamState((s) => ({
                    ...s,
                    threadId: data.threadId ?? s.threadId,
                    currentNode: data.node ?? null,
                    state: data.state ?? s.state,
                  }));
                } else if (eventType === "node_end" || eventType === "state_update") {
                  setStreamState((s) => ({
                    ...s,
                    threadId: data.threadId ?? s.threadId,
                    currentNode: eventType === "node_end" ? data.node ?? s.currentNode : s.currentNode,
                    state: data.state ?? s.state,
                  }));
                } else if (eventType === "done") {
                  setStreamState((s) => ({
                    ...s,
                    threadId: data.threadId ?? s.threadId,
                    status: "done",
                    currentNode: null,
                    // Ensure graph state.status is "completed" so UI shows "已完成" even if last state_update was lost or reordered
                    state: s.state ? { ...s.state, status: "completed" as const } : { status: "completed" as const },
                  }));
                  return;
                } else if (eventType === "error") {
                  setStreamState((s) => ({
                    ...s,
                    status: "error",
                    errorMessage: data.message ?? "Unknown error",
                  }));
                  return;
                }
              } catch {
                // ignore parse errors for non-JSON lines
              }
            }
          }
        }
        setStreamState((s) => ({
          ...s,
          status: "done",
          threadId: threadId ?? s.threadId,
          state: s.state ? { ...s.state, status: "completed" as const } : { status: "completed" as const },
        }));
      } catch (err) {
        setStreamState((s) => ({
          ...s,
          status: "error",
          errorMessage: err instanceof Error ? err.message : "Stream error",
        }));
      }
    },
    []
  );

  const reset = useCallback(() => {
    setStreamState({
      currentNode: null,
      state: null,
      threadId: null,
      status: "idle",
      errorMessage: null,
    });
  }, []);

  return { streamState, startGenerate, reset };
}
