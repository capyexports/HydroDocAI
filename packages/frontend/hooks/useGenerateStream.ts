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

interface ParsedSSEEvent {
  type: SSEEventType;
  data: {
    threadId?: string;
    node?: string;
    state?: Partial<WaterDocumentState>;
    message?: string;
  };
}

/** Minimum time each node stays highlighted in the step indicator (ms). */
const NODE_MIN_DISPLAY_MS = 400; // step display duration

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
        setStreamState((s) => ({ ...s, status: "error", currentNode: null, errorMessage: msg }));
        return;
      }

      if (!res.ok || !res.body) {
        setStreamState((s) => ({
          ...s,
          status: "error",
          currentNode: null,
          errorMessage: res.statusText || "Request failed",
        }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      /**
       * Event queue: the reader loop pushes parsed SSE events here as fast as
       * they arrive. The consumer loop below drains the queue sequentially,
       * inserting a minimum display delay after each node_end so the step
       * indicator advances visibly one step at a time.
       */
      const queue: ParsedSSEEvent[] = [];
      let readerDone = false;

      // --- Producer: read bytes and parse SSE into queue ---
      const produce = async () => {
        let buffer = "";
        let eventType: SSEEventType = "state_update";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7).trim() as SSEEventType;
              } else if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6)) as ParsedSSEEvent["data"];
                  queue.push({ type: eventType, data });
                } catch {
                  // ignore non-JSON lines
                }
              }
            }
          }
        } finally {
          readerDone = true;
        }
      };

      // --- Consumer: drain queue serially with min display time per node ---
      const consume = async () => {
        let accumulatedState: Partial<WaterDocumentState> | null = null;
        let threadId: string | null = null;

        const waitForItem = (): Promise<void> =>
          new Promise((resolve) => {
            const check = () => {
              if (queue.length > 0 || readerDone) resolve();
              else setTimeout(check, 16);
            };
            check();
          });

        try {
          while (true) {
            await waitForItem();
            if (queue.length === 0 && readerDone) break;
            if (queue.length === 0) continue;

            const { type: eventType, data } = queue.shift()!;
            if (data.threadId) threadId = data.threadId;

            if (eventType === "node_start") {
              if (data.state != null)
                accumulatedState = { ...accumulatedState, ...data.state } as Partial<WaterDocumentState>;
              setStreamState((s) => ({
                ...s,
                threadId: data.threadId ?? s.threadId,
                currentNode: data.node ?? null,
                state: data.state != null ? ({ ...(s.state ?? {}), ...data.state } as Partial<WaterDocumentState>) : s.state,
              }));
              // Hold each node's "in progress" state for at least NODE_MIN_DISPLAY_MS
              // so the step indicator visibly advances one step at a time.
              await new Promise((r) => setTimeout(r, NODE_MIN_DISPLAY_MS));
            } else if (eventType === "node_end") {
              if (data.state != null)
                accumulatedState = { ...accumulatedState, ...data.state } as Partial<WaterDocumentState>;
              setStreamState((s) => {
                const merged = data.state != null ? ({ ...(s.state ?? {}), ...data.state } as Partial<WaterDocumentState>) : s.state;
                return {
                  ...s,
                  threadId: data.threadId ?? s.threadId,
                  currentNode: data.node ?? s.currentNode,
                  state: merged,
                };
              });
            } else if (eventType === "state_update") {
              if (data.state != null)
                accumulatedState = { ...accumulatedState, ...data.state } as Partial<WaterDocumentState>;
              setStreamState((s) => {
                const merged = data.state != null ? ({ ...(s.state ?? {}), ...data.state } as Partial<WaterDocumentState>) : s.state;
                return { ...s, threadId: data.threadId ?? s.threadId, state: merged };
              });
            } else if (eventType === "done") {
              const finalState = accumulatedState
                ? { ...accumulatedState, status: "completed" as const }
                : { status: "completed" as const };
              setStreamState((s) => ({
                ...s,
                threadId: data.threadId ?? s.threadId ?? threadId,
                status: "done",
                currentNode: null,
                state: finalState,
              }));
              return;
            } else if (eventType === "error") {
              setStreamState((s) => ({
                ...s,
                status: "error",
                currentNode: null,
                errorMessage: data.message ?? "Unknown error",
              }));
              return;
            }
          }

          // Stream ended without a "done" event.
          // If the workflow interrupted for human review, preserve the reviewing status
          // rather than marking as completed — the graph is paused, not finished.
          const isInterrupted = accumulatedState?.needsHumanReview === true;
          const finalStatus = isInterrupted ? (accumulatedState?.status ?? "reviewing") : "completed";
          const finalState = accumulatedState
            ? { ...accumulatedState, status: finalStatus as WaterDocumentState["status"] }
            : { status: finalStatus as WaterDocumentState["status"] };
          setStreamState((s) => ({
            ...s,
            status: "done",
            currentNode: null,
            threadId: threadId ?? s.threadId,
            state: finalState,
          }));
        } catch (err) {
          setStreamState((s) => ({
            ...s,
            status: "error",
            currentNode: null,
            errorMessage: err instanceof Error ? err.message : "Stream error",
          }));
        }
      };

      // Run producer and consumer concurrently.
      await Promise.all([produce(), consume()]);
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
