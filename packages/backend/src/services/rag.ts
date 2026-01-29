import fs from "node:fs/promises";
import path from "node:path";
import type { LegalCitation } from "@shared/index";

export interface RagSearchOptions {
  /** Maximum number of citations to return. */
  topK?: number;
}

export interface RagSearchResult {
  /** Retrieved legal citations. */
  citations: LegalCitation[];
  /**
   * When true, it means we couldn't find sufficient legal grounds
   * for the given query and downstream nodes should treat this as
   * `[INSUFFICIENT_LEGAL_GROUNDS]`.
   */
  insufficientLegalGrounds: boolean;
}

interface ScoredCitation extends LegalCitation {
  score: number;
}

/**
 * Simple local RAG service for law articles.
 *
 * 当前实现仅基于本地关键词匹配，后续可以在 `semanticSearch`
 * 中接入向量检索引擎，实现真正的双路检查（语义 + 关键词）。
 */
export class RagService {
  constructor(private readonly lawLibraryDir: string) {}

  /**
   * Main public search API used by LangGraph nodes.
   * It performs keyword search and (in the future) semantic search,
   * then merges the results.
   */
  async searchLaw(query: string, options: RagSearchOptions = {}): Promise<RagSearchResult> {
    const topK = options.topK ?? 5;

    const [keywordResults, semanticResults] = await Promise.all([
      this.keywordSearch(query, topK),
      this.semanticSearch(query, topK),
    ]);

    const merged = this.mergeAndRank([...keywordResults, ...semanticResults], topK);

    if (merged.length === 0) {
      return {
        citations: [],
        insufficientLegalGrounds: true,
      };
    }

    return {
      citations: merged.map(({ score: _score, ...rest }) => rest),
      insufficientLegalGrounds: false,
    };
  }

  /**
   * Basic keyword-based retrieval over local markdown law files.
   */
  private async keywordSearch(query: string, topK: number): Promise<ScoredCitation[]> {
    const files = await fs.readdir(this.lawLibraryDir);
    const lowercaseQuery = query.toLowerCase();
    const scored: ScoredCitation[] = [];

    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const fullPath = path.join(this.lawLibraryDir, file);
      const content = await fs.readFile(fullPath, "utf8");

      // Skip outdated or invalid articles.
      if (content.includes("（已废止）") || content.includes("（待修订）")) {
        continue;
      }

      const lawTitle = `《${path.parse(file).name}》`;
      const lines = content.split(/\r?\n/);

      for (const line of lines) {
        const normalizedLine = line.trim();
        if (!normalizedLine) continue;

        if (normalizedLine.toLowerCase().includes(lowercaseQuery)) {
          const score = this.simpleKeywordScore(normalizedLine, lowercaseQuery);
          scored.push({
            title: lawTitle,
            articleText: normalizedLine,
            score,
          });
        }
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * Placeholder for future semantic / vector-based search.
   * For now it returns an empty list but keeps the interface ready
   * for plugging in a real embedding + vector index implementation.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async semanticSearch(_query: string, _topK: number): Promise<ScoredCitation[]> {
    // TODO: integrate vector store based search here.
    return [];
  }

  private mergeAndRank(citations: ScoredCitation[], topK: number): ScoredCitation[] {
    const seen = new Map<string, ScoredCitation>();
    for (const c of citations) {
      const key = `${c.title}:${c.articleText}`;
      const existing = seen.get(key);
      if (!existing || existing.score < c.score) {
        seen.set(key, c);
      }
    }

    return Array.from(seen.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  private simpleKeywordScore(text: string, query: string): number {
    const lcText = text.toLowerCase();
    const lcQuery = query.toLowerCase();
    let count = 0;
    let idx = lcText.indexOf(lcQuery);
    while (idx !== -1) {
      count += 1;
      idx = lcText.indexOf(lcQuery, idx + lcQuery.length);
    }
    return count;
  }
}

