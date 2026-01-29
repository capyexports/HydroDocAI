import { Annotation, END, MemorySaver, StateGraph } from "@langchain/langgraph";
import type { WaterDocumentState } from "@shared/index";

/**
 * LangGraph root state definition for WaterDocument workflow.
 * This must stay in sync with `WaterDocumentState` from `@shared`.
 */
export const WaterDocumentStateAnnotation = Annotation.Root({
  rawInput: Annotation<string>(),
  documentContent: Annotation<string>(),
  legalCitations: Annotation<WaterDocumentState["legalCitations"]>(),
  status: Annotation<string>(),
  revisionCount: Annotation<number>(),
  threadId: Annotation<string>(),
});

export type GraphState = typeof WaterDocumentStateAnnotation.State;

/**
 * draftNode
 * Basic placeholder node that simulates drafting a document from raw input.
 */
async function draftNode(state: GraphState): Promise<Partial<GraphState>> {
  console.log(`[Flow] Node: draftNode | Thread: ${state.threadId}`);

  return {
    documentContent: `【草案】\n\n${state.rawInput}`,
    status: "drafting",
    revisionCount: (state.revisionCount ?? 0) + 1,
  };
}

/**
 * auditNode
 * Placeholder for legal / structural audit of the drafted document.
 * It currently just logs and decides next step based on a simple heuristic.
 */
async function auditNode(state: GraphState): Promise<Partial<GraphState>> {
  console.log(`[Flow] Node: auditNode | Thread: ${state.threadId}`);

  // TODO: plug in real legal / structure audit logic.
  // For now, we only bump revision count and keep status in reviewing.
  return {
    status: "reviewing",
    revisionCount: (state.revisionCount ?? 0) + 1,
  };
}

/**
 * humanReviewNode
 * Represents a human-in-the-loop checkpoint.
 * For now, it only logs and marks the state as reviewing.
 */
async function humanReviewNode(state: GraphState): Promise<Partial<GraphState>> {
  console.log(`[Flow] Node: humanReviewNode | Thread: ${state.threadId}`);

  // In the future we will integrate `interruptAfter` / explicit human approval here.
  return {
    status: "reviewing",
  };
}

/**
 * exportNode
 * Finalization node that would eventually call docx.js to render GB/T 9704 documents.
 * For now, it only logs and marks the workflow as completed.
 */
async function exportNode(state: GraphState): Promise<Partial<GraphState>> {
  console.log(`[Flow] Node: exportNode | Thread: ${state.threadId}`);

  return {
    status: "completed",
  };
}

/**
 * Decide next step after audit:
 * - If revisionCount >= 2, send to humanReviewNode.
 * - Otherwise, directly go to exportNode.
 */
function routeAfterAudit(state: GraphState): "humanReviewNode" | "exportNode" {
  const revisionCount = state.revisionCount ?? 0;
  if (revisionCount >= 2) {
    return "humanReviewNode";
  }
  return "exportNode";
}

/**
 * Construct the stateful graph for WaterDocument workflow.
 */
const builder = new StateGraph(WaterDocumentStateAnnotation)
  // Nodes
  .addNode("draftNode", draftNode)
  .addNode("auditNode", auditNode)
  .addNode("humanReviewNode", humanReviewNode)
  .addNode("exportNode", exportNode)
  // Edges
  .addEdge("__start__", "draftNode")
  .addEdge("draftNode", "auditNode")
  .addConditionalEdges("auditNode", routeAfterAudit, {
    humanReviewNode: "humanReviewNode",
    exportNode: "exportNode",
  })
  .addEdge("humanReviewNode", "exportNode")
  .addEdge("exportNode", END);

const checkpointer = new MemorySaver();

export const waterDocumentGraph = builder.compile({
  checkpointer,
});

