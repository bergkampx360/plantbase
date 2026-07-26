import { embedTexts } from './embed';
import { generateHypotheticalAnswer } from './hyde';
import { searchChunks } from './knowledge-store';
import { rerankChunks, type RankedChunk } from './rerank';

export const CANDIDATE_LIMIT = 10;
export const TOP_N = 4;
export const WEAK_RESULT_SCORE_THRESHOLD = 4;

export interface RetrievalResult {
  chunks: RankedChunk[];
  hitCount: number;
  topScore: number;
  /**
   * true, ha a topScore a WEAK_RESULT_SCORE_THRESHOLD alatt van (vagy nincs találat) — kódszintű
   * jelzés az agent önreflektáló keresésének, nem a modell szubjektív ítéletére bízva (F6 utólagos
   * javítás: a modell a szöveges "ha gyenge..." szabályt önmagában nem tartotta be konzisztensen).
   */
  weak: boolean;
}

/**
 * Teljes keresési pipeline: HyDE → embedding → pgvector-keresés (RO pool) → rerank.
 * A visszaadott hitCount/topScore/weak teszi lehetővé az agent önreflektáló keresését
 * (gyenge találatnál újrafogalmazott kérdéssel újrahívható) — docs/rag-pipeline.md.
 */
export async function retrieve(question: string): Promise<RetrievalResult> {
  const hypotheticalAnswer = await generateHypotheticalAnswer(question);
  const [queryEmbedding] = await embedTexts([hypotheticalAnswer]);
  const candidates = await searchChunks(queryEmbedding, CANDIDATE_LIMIT);
  const ranked = await rerankChunks(question, candidates);
  const chunks = ranked.slice(0, TOP_N);
  const topScore = chunks[0]?.score ?? 0;

  return {
    chunks,
    hitCount: chunks.length,
    topScore,
    weak: topScore < WEAK_RESULT_SCORE_THRESHOLD,
  };
}
