/**
 * Graph-layer citation formatting per 200-legal-rag-standards: 根据《法典名》第X条之规定："原文片段"
 */
import type { LegalCitation } from "@hydrodocai/shared";

export function formatCitation(c: LegalCitation): string {
  const num = c.articleNumber != null ? String(c.articleNumber) : "X";
  return `根据${c.title}第${num}条之规定："${c.articleText}"`;
}

export function formatCitations(citations: LegalCitation[]): string[] {
  return citations.map(formatCitation);
}
