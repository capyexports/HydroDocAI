"use client";

import { useCallback, useState } from "react";
import type { WaterDocumentState } from "@hydrodocai/shared";
import { getApiUrl } from "../lib/getApiUrl";

export interface ResumeStreamState {
  status: "idle" | "streaming" | "done" | "error";
  errorMessage: string | null;
  state: Partial<WaterDocumentState> | null;
}

export function useResumeStream() {
  const [resumeState, setResumeState] = useState<ResumeStreamState>({
    status: "idle",
    errorMessage: null,
    state: null,
  });

  const resume = useCallback(
    async (payload: { threadId: string; approved: boolean; documentContent?: string }) => {
      setResumeState((s) => ({ ...s, status: "streaming", errorMessage: null }));

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
      let lastState: Partial<WaterDocumentState> | null = null;

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
                const data = JSON.parse(line.slice(6)) as { state?: Partial<WaterDocumentState>; message?: string };
                if (data.state) lastState = data.state;
                if (eventType === "state_update") {
                  setResumeState((s) => ({ ...s, state: data.state ?? s.state }));
                } else if (eventType === "done") {
                  setResumeState((s) => ({ ...s, status: "done", state: lastState ?? s.state }));
                  return;
                } else if (eventType === "error") {
                  setResumeState((s) => ({
                    ...s,
                    status: "error",
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
        setResumeState((s) => ({ ...s, status: "done", state: lastState ?? s.state }));
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
    setResumeState({ status: "idle", errorMessage: null, state: null });
  }, []);

  return { resumeState, resume, reset };
}
