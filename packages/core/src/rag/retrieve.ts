import { embedTexts } from './embed';
import { generateHypotheticalAnswer } from './hyde';
import { searchChunks } from './knowledge-store';
import { rerankChunks, type RankedChunk } from './rerank';

const CANDIDATE_LIMIT = 10;
const TOP_N = 4;
export const WEAK_RESULT_SCORE_THRESHOLD = 4;

export interface RetrievalResult {
  chunks: RankedChunk[];
  hitCount: number;
  topScore: number;
}

/**
 * Teljes keresési pipeline: HyDE → embedding → pgvector-keresés (RO pool) → rerank.
 * A visszaadott hitCount/topScore teszi lehetővé az agent önreflektáló keresését
 * (gyenge találatnál újrafogalmazott kérdéssel újrahívható) — docs/rag-pipeline.md.
 */
export async function retrieve(question: string): Promise<RetrievalResult> {
  const hypotheticalAnswer = await generateHypotheticalAnswer(question);
  const [queryEmbedding] = await embedTexts([hypotheticalAnswer]);
  const candidates = await searchChunks(queryEmbedding, CANDIDATE_LIMIT);
  const ranked = await rerankChunks(question, candidates);
  const chunks = ranked.slice(0, TOP_N);

  return {
    chunks,
    hitCount: chunks.length,
    topScore: chunks[0]?.score ?? 0,
  };
}
