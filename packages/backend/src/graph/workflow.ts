import path from "node:path";
import { existsSync } from "node:fs";
import { Annotation, END, MemorySaver, StateGraph } from "@langchain/langgraph";
import type { ExtractedEntities, WaterDocumentState } from "@hydrodocai/shared";
import { chat } from "../services/llm.js";
import { RagService } from "../services/rag.js";
import { formatCitation } from "./citationFormat.js";

/**
 * LangGraph root state definition for WaterDocument workflow.
 * This must stay in sync with `WaterDocumentState` from `@hydrodocai/shared`.
 */
export const WaterDocumentStateAnnotation = Annotation.Root({
  rawInput: Annotation<string>(),
  documentContent: Annotation<string>(),
  legalCitations: Annotation<WaterDocumentState["legalCitations"]>(),
  status: Annotation<string>(),
  revisionCount: Annotation<number>(),
  threadId: Annotation<string>(),
  documentType: Annotation<WaterDocumentState["documentType"]>(),
  entities: Annotation<WaterDocumentState["entities"]>(),
  needsHumanReview: Annotation<WaterDocumentState["needsHumanReview"]>(),
  humanReviewReason: Annotation<WaterDocumentState["humanReviewReason"]>(),
});

export type GraphState = typeof WaterDocumentStateAnnotation.State;

// Resolve data/law-library: from repo root (when cwd is packages/backend) or cwd
const cwd = process.cwd();
const lawLibraryDir =
  existsSync(path.join(cwd, "data", "law-library"))
    ? path.join(cwd, "data", "law-library")
    : path.join(cwd, "..", "..", "data", "law-library");
const ragService = new RagService(lawLibraryDir);

async function extractEntities(rawInput: string): Promise<ExtractedEntities> {
  const system = `你是一个水利执法文书助手。从用户提供的现场描述、笔录或OCR文本中提取违规主体、时间、地点、违规行为。只输出一个JSON对象，包含可选字段：subject（违规主体）、time（时间）、place（地点）、violation（违规行为描述）。不要输出其他文字。`;
  const content = await chat([{ role: "system", content: system }, { role: "user", content: rawInput }]);
  try {
    const parsed = JSON.parse(content.trim().replace(/^```json\s*|\s*```$/g, "")) as ExtractedEntities;
    return parsed;
  } catch {
    return {};
  }
}

async function generateDraft(
  rawInput: string,
  documentType: WaterDocumentState["documentType"],
  citationLines: string[]
): Promise<string> {
  const docType = documentType ?? "限期缴纳通知书";
  const system = `你是水利系统公文起草助手。根据用户提供的素材和给定的法律引用，起草一份符合规范的《${docType}》草案正文。要求：语言规范、引用法条时使用提供的格式；只输出公文正文内容，不要输出标题或落款。`;
  const userContent = `素材：\n${rawInput}\n\n法律依据（请按此格式引用）：\n${citationLines.join("\n")}`;
  return chat([{ role: "system", content: system }, { role: "user", content: userContent }]);
}

/**
 * draftNode: entity extraction → RAG searchLaw → draft generation (LLM).
 */
async function draftNode(state: GraphState): Promise<Partial<GraphState>> {
  console.log(`[Flow] Node: draftNode | Thread: ${state.threadId}`);

  const rawInput = state.rawInput?.trim() ?? "";
  if (!rawInput) {
    return {
      documentContent: "",
      status: "drafting",
      revisionCount: (state.revisionCount ?? 0) + 1,
    };
  }

  const entities = await extractEntities(rawInput);
  const query = [entities.violation, entities.place, rawInput].filter(Boolean).join(" ") || rawInput;
  const ragResult = await ragService.searchLaw(query, { topK: 5 });

  const legalCitations = ragResult.insufficientLegalGrounds ? [] : ragResult.citations;
  const citationLines = legalCitations.map(formatCitation);
  const documentContent = await generateDraft(rawInput, state.documentType, citationLines);

  return {
    entities,
    legalCitations,
    documentContent,
    status: "drafting",
    revisionCount: (state.revisionCount ?? 0) + 1,
  };
}

/**
 * legalVerificationNode: compare documentContent with legalCitations; set needsHumanReview if mismatch.
 */
async function legalVerificationNode(state: GraphState): Promise<Partial<GraphState>> {
  console.log(`[Flow] Node: legalVerificationNode | Thread: ${state.threadId}`);

  const content = state.documentContent ?? "";
  const citations = state.legalCitations ?? [];
  const citationLines = citations.map(formatCitation);
  let needsHumanReview = false;
  let humanReviewReason: string | undefined;

  for (const line of citationLines) {
    const quoted = line.slice(line.indexOf('"'), line.lastIndexOf('"') + 1);
    const snippet = quoted.slice(1, -1).slice(0, 50);
    if (snippet && !content.includes(snippet)) {
      needsHumanReview = true;
      humanReviewReason = "生成内容与检索法条原文不一致，需人工核验。";
      break;
    }
  }

  return {
    status: "reviewing",
    needsHumanReview: needsHumanReview ? true : undefined,
    humanReviewReason,
  };
}

/**
 * auditNode: legal compliance audit; output needsHumanReview + humanReviewReason; revisionCount > 3 → humanReview.
 */
async function auditNode(state: GraphState): Promise<Partial<GraphState>> {
  console.log(`[Flow] Node: auditNode | Thread: ${state.threadId}`);

  const revisionCount = (state.revisionCount ?? 0) + 1;
  const alreadyNeedsReview = state.needsHumanReview === true;
  const reason = state.humanReviewReason;

  if (revisionCount > 3) {
    return {
      status: "reviewing",
      revisionCount,
      needsHumanReview: true,
      humanReviewReason: reason ?? "修订次数过多，请人工确认。",
    };
  }

  return {
    status: "reviewing",
    revisionCount,
    needsHumanReview: alreadyNeedsReview ? true : undefined,
    humanReviewReason: reason,
  };
}

/**
 * humanReviewNode: interrupt point; graph pauses after this node until resume with user input.
 */
async function humanReviewNode(state: GraphState): Promise<Partial<GraphState>> {
  console.log(`[Flow] Node: humanReviewNode | Thread: ${state.threadId}`);
  return { status: "reviewing" };
}

/** In-memory store for exported .docx buffers (threadId → Buffer). Used by GET /api/download/:threadId. */
export const exportedDocxBuffers = new Map<string, Buffer>();

const DOCX_EXPORT_TIMEOUT_MS = 15_000;

/**
 * exportNode: run docx export so GET /api/download works. Use timeout to avoid blocking the event loop.
 */
async function exportNode(state: GraphState): Promise<Partial<GraphState>> {
  console.log(`[Flow] Node: exportNode | Thread: ${state.threadId}`);

  const fullState: WaterDocumentState = {
    rawInput: state.rawInput ?? "",
    documentContent: state.documentContent ?? "",
    legalCitations: state.legalCitations ?? [],
    status: (state.status ?? "completed") as WaterDocumentState["status"],
    revisionCount: state.revisionCount ?? 0,
    threadId: state.threadId ?? "",
    documentType: state.documentType,
    entities: state.entities,
    needsHumanReview: state.needsHumanReview,
    humanReviewReason: state.humanReviewReason,
  };
  try {
    const { exportToDocx } = await import("../services/docx/index.js");
    const buffer = await Promise.race([
      exportToDocx(fullState),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("docx export timeout")), DOCX_EXPORT_TIMEOUT_MS)
      ),
    ]);
    exportedDocxBuffers.set(state.threadId!, buffer);
  } catch (err) {
    console.error(`[Flow] exportNode error | Thread: ${state.threadId}`, err);
  }

  return { status: "completed" };
}

/**
 * Route after audit: needsHumanReview === true → humanReviewNode; else → exportNode.
 */
function routeAfterAudit(state: GraphState): "humanReviewNode" | "exportNode" {
  if (state.needsHumanReview === true) return "humanReviewNode";
  return "exportNode";
}

/**
 * Construct the stateful graph for WaterDocument workflow.
 */
const builder = new StateGraph(WaterDocumentStateAnnotation)
  .addNode("draftNode", draftNode)
  .addNode("legalVerificationNode", legalVerificationNode)
  .addNode("auditNode", auditNode)
  .addNode("humanReviewNode", humanReviewNode)
  .addNode("exportNode", exportNode)
  .addEdge("__start__", "draftNode")
  .addEdge("draftNode", "legalVerificationNode")
  .addEdge("legalVerificationNode", "auditNode")
  .addConditionalEdges("auditNode", routeAfterAudit, {
    humanReviewNode: "humanReviewNode",
    exportNode: "exportNode",
  })
  .addEdge("humanReviewNode", "exportNode")
  .addEdge("exportNode", END);

const checkpointer = new MemorySaver();

export const waterDocumentGraph = builder.compile({
  checkpointer,
  interruptAfter: ["humanReviewNode"],
});

