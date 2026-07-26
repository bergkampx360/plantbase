import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import type { SearchResult } from './knowledge-store';

const RERANK_MODEL = 'gpt-4.1-mini';

export interface RankedChunk extends SearchResult {
  score: number;
}

const RerankScores = z.object({
  scores: z.array(
    z.object({
      index: z.number(),
      score: z.number().min(0).max(10),
    }),
  ),
});

/**
 * A nyers vektorkeresés jelöltjeit pontozza újra egy strukturált LLM-hívással
 * (0-10 relevancia-pontszám a kérdéshez), és a pontszám szerint csökkenő
 * sorrendbe rendezi — docs/rag-pipeline.md.
 */
export async function rerankChunks(
  question: string,
  candidates: SearchResult[],
): Promise<RankedChunk[]> {
  if (candidates.length === 0) return [];

  const { object } = await generateObject({
    model: openai(RERANK_MODEL),
    schema: RerankScores,
    prompt: `Kérdés: ${question}\n\nÉrtékeld 0-10 skálán, mennyire releváns az alábbi, sorszámozott szövegrészletek mindegyike a kérdés megválaszolásához (10 = teljesen releváns, 0 = irreleváns). Minden sorszámhoz adj egy pontszámot.\n\n${candidates
      .map((candidate, index) => `[${index}] ${candidate.content}`)
      .join('\n\n')}`,
  });

  const scoreByIndex = new Map(object.scores.map((entry) => [entry.index, entry.score]));

  return candidates
    .map((candidate, index) => ({ ...candidate, score: scoreByIndex.get(index) ?? 0 }))
    .sort((a, b) => b.score - a.score);
}
