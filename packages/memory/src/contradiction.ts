// Contradiction detection (v3 §7) — flags new statements that conflict with
// stored high-confidence memories, without an LLM round-trip. Uses normalized
// token overlap: high lexical overlap with a different polarity/value signals
// a possible contradiction for the thought generator to resolve.

import { Memory } from '@whatsapp-ai-agent/data';

const STOPWORDS = new Set(['o', 'a', 'os', 'as', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'e', 'ou', 'que', 'com', 'para', 'por', 'se', 'não', 'nao']);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zà-ú0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function overlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const set = new Set(a);
  let hits = 0;
  for (const token of b) if (set.has(token)) hits += 1;
  return hits / Math.min(a.length, b.length);
}

export interface ContradictionResult {
  memoryId: string;
  content: string;
  score: number;
}

/**
 * Compare an incoming statement against the user's high-confidence memories.
 * Returns candidates whose token overlap is suspiciously high (same subject,
 * different assertion) so the caller can emit a MemoryContradiction event.
 */
export function detectContradiction(
  statement: string,
  memories: Memory[],
  minConfidence = 0.7,
  threshold = 0.5,
): ContradictionResult[] {
  const statementTokens = tokens(statement);
  if (statementTokens.length < 3) return [];
  return memories
    .filter((memory) => memory.confidence >= minConfidence && memory.verificationStatus !== 'contradicted')
    .map((memory) => {
      const memoryTokens = tokens(memory.content);
      const score = overlap(statementTokens, memoryTokens);
      return { memoryId: memory.id, content: memory.content, score };
    })
    .filter((candidate) => candidate.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
