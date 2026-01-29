import express, { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { waterDocumentGraph } from "./graph/workflow.js";
import type { WaterDocumentState } from "@shared/index";

export { waterDocumentGraph };

/**
 * Helper to run the workflow once with an initial state.
 * This is mainly for local testing / debugging.
 */
export async function runWaterDocumentWorkflow(initial: WaterDocumentState) {
  const result = await waterDocumentGraph.invoke(initial);
  return result;
}

/**
 * Initialize an Express app with SSE endpoint for LangGraph streaming.
 */
export function createApp() {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/generate", async (req: Request, res: Response) => {
    // Setup SSE headers according to architecture rules.
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    const body = (req.body ?? {}) as Partial<WaterDocumentState> & {
      rawInput?: string;
      threadId?: string;
    };

    const threadId = body.threadId || randomUUID();

    const initialState: WaterDocumentState = {
      rawInput: body.rawInput ?? "",
      documentContent: body.documentContent ?? "",
      legalCitations: body.legalCitations ?? [],
      status: body.status ?? "idle",
      revisionCount: body.revisionCount ?? 0,
      threadId,
    };

    const sendEvent = (event: "node_start" | "node_end" | "state_update" | "error" | "done", data: unknown) => {
      const payload = JSON.stringify(data);
      res.write(`event: ${event}\n`);
      res.write(`data: ${payload}\n\n`);
    };

    try {
      const events = waterDocumentGraph.streamEvents(initialState, {
        version: "v1",
        configurable: {
          thread_id: threadId,
        },
      });

      for await (const event of events) {
        const { event: eventName } = event;

        if (eventName === "on_node_start") {
          sendEvent("node_start", {
            threadId,
            node: event.name,
            state: event.data?.input ?? null,
          });
        } else if (eventName === "on_node_end") {
          sendEvent("node_end", {
            threadId,
            node: event.name,
            state: event.data?.output ?? null,
          });

          // Also emit a generic state update after each node completes.
          sendEvent("state_update", {
            threadId,
            state: event.data?.output ?? null,
          });
        }
      }

      sendEvent("done", { threadId });
      res.end();
    } catch (error) {
      // Ensure errors are also streamed to the client.
      sendEvent("error", {
        threadId,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      res.end();
    }
  });

  return app;
}

// If this file is executed directly, start the HTTP server.
if (import.meta.url === `file://${process.argv[1]}`) {
  const app = createApp();
  const port = Number(process.env.PORT ?? 4001);
  app.listen(port, () => {
    console.log(`HydroDocAI backend listening on http://localhost:${port}`);
  });
}

