import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import cors from "cors";
import express, { Request, Response } from "express";
import { waterDocumentGraph, exportedDocxBuffers } from "./graph/workflow.js";
import type { WaterDocumentState } from "@hydrodocai/shared";

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !match[1].startsWith("#")) {
      const value = match[2].replace(/^["']|["']$/g, "").trim();
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  }
}
loadEnvFile(path.resolve(process.cwd(), ".env"));
if (!process.env.API_KEY) loadEnvFile(path.resolve(process.cwd(), "../../.env"));

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

  app.use(cors({ origin: process.env.CORS_ORIGIN ?? true }));
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
      documentType?: WaterDocumentState["documentType"];
    };

    const threadId = body.threadId || randomUUID();

    const initialState: WaterDocumentState = {
      rawInput: body.rawInput ?? "",
      documentContent: body.documentContent ?? "",
      legalCitations: body.legalCitations ?? [],
      status: body.status ?? "idle",
      revisionCount: body.revisionCount ?? 0,
      threadId,
      documentType: body.documentType,
    };

    const sendEvent = (event: "node_start" | "node_end" | "state_update" | "error" | "done", data: unknown): Promise<void> =>
      new Promise((resolve, reject) => {
        const payload = JSON.stringify(data);
        res.write(`event: ${event}\n`);
        res.write(`data: ${payload}\n\n`, (err) => (err ? reject(err) : resolve()));
      });

    try {
      const events = waterDocumentGraph.streamEvents(initialState, {
        version: "v1",
        configurable: {
          thread_id: threadId,
        },
      });

      /** Graph node names: LangGraph emits on_chain_start/on_chain_end, not on_node_*. */
      const NODE_NAMES = new Set(["draftNode", "legalVerificationNode", "auditNode", "humanReviewNode", "exportNode"]);
      /** Accumulate full state on backend so state_update always sends complete state (including documentContent). */
      let accumulatedState: Record<string, unknown> = { ...initialState } as Record<string, unknown>;

      for await (const event of events) {
        const ev = event as { event?: string; name?: string; data?: Record<string, unknown> };
        const eventName = ev.event;
        const nodeName = ev.name;
        if (eventName === "on_chain_start" && nodeName && NODE_NAMES.has(nodeName)) {
          await sendEvent("node_start", {
            threadId,
            node: nodeName,
            state: ev.data?.input ?? null,
          });
          await new Promise((r) => setImmediate(r));
        } else if (eventName === "on_chain_end" && nodeName && NODE_NAMES.has(nodeName)) {
          const dataObj = ev.data;
          const output = (dataObj?.output ?? dataObj?.data ?? dataObj) ?? null;
          const delta = output && typeof output === "object" ? (output as Record<string, unknown>) : {};
          accumulatedState = { ...accumulatedState, ...delta };
          await sendEvent("node_end", {
            threadId,
            node: nodeName,
            state: accumulatedState,
          });
          await sendEvent("state_update", {
            threadId,
            state: accumulatedState,
          });
          await new Promise((r) => setImmediate(r));
        }
      }

      await sendEvent("done", { threadId });
      res.end();
    } catch (error) {
      try {
        await sendEvent("error", {
          threadId,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        res.end();
      }
    }
  });

  /** Resume after human review: body { threadId, approved, documentContent? }. Continues from humanReviewNode to exportNode. */
  app.post("/api/resume", async (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    const body = req.body as { threadId: string; approved: boolean; documentContent?: string };
    const threadId = body?.threadId;
    if (!threadId) {
      res.status(400).json({ error: "threadId is required" });
      return;
    }

    const sendEvent = (event: "node_start" | "node_end" | "state_update" | "error" | "done", data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const update = body.approved === false && body.documentContent != null ? { documentContent: body.documentContent } : {};
      const events = waterDocumentGraph.streamEvents(update, {
        version: "v1",
        configurable: { thread_id: threadId },
      });

      const NODE_NAMES = new Set(["draftNode", "legalVerificationNode", "auditNode", "humanReviewNode", "exportNode"]);
      let accumulatedState: Record<string, unknown> = { ...update } as Record<string, unknown>;

      for await (const event of events) {
        const ev = event as { event?: string; name?: string; data?: Record<string, unknown> };
        const eventName = ev.event;
        const nodeName = ev.name;
        if (eventName === "on_chain_start" && nodeName && NODE_NAMES.has(nodeName)) {
          sendEvent("node_start", { threadId, node: nodeName, state: ev.data?.input ?? null });
        } else if (eventName === "on_chain_end" && nodeName && NODE_NAMES.has(nodeName)) {
          const dataObj = ev.data;
          const output = (dataObj?.output ?? dataObj?.data ?? dataObj) ?? null;
          const delta = output && typeof output === "object" ? (output as Record<string, unknown>) : {};
          accumulatedState = { ...accumulatedState, ...delta };
          sendEvent("node_end", { threadId, node: nodeName, state: accumulatedState });
          sendEvent("state_update", { threadId, state: accumulatedState });
        }
      }
      sendEvent("done", { threadId });
      res.end();
    } catch (error) {
      sendEvent("error", { threadId, message: error instanceof Error ? error.message : "Unknown error" });
      res.end();
    }
  });

  /** Download .docx for a completed thread. Returns 404 if not found. */
  app.get("/api/download/:threadId", (req: Request, res: Response) => {
    const threadId = req.params.threadId;
    const buffer = exportedDocxBuffers.get(threadId);
    if (!buffer) {
      res.status(404).json({ error: "Document not found or not yet exported" });
      return;
    }
    const docType = "公文";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(docType)}-${threadId.slice(0, 8)}.docx"`);
    res.send(buffer);
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

