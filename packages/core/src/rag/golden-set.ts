import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(__dirname, '../../../../.env') });

import { embedTexts } from './embed';
import { generateHypotheticalAnswer } from './hyde';
import { searchChunks, type SearchResult } from './knowledge-store';
import { rerankChunks } from './rerank';
import { CANDIDATE_LIMIT, TOP_N, WEAK_RESULT_SCORE_THRESHOLD } from './retrieve';

/**
 * F7 golden set (docs/implementation/05-rag-pipeline.md) — nyers vektorkeresés vs. teljes
 * pipeline (HyDE + rerank) összevetése, ugyanazon jelölt-halmazon (egyetlen HyDE-hívásból),
 * hogy a rerank hatása a HyDE-hatástól elkülöníthető legyen. Egyszeri kiértékelő szkript, mint
 * az ingest.ts — nincs saját spec-je, ld. docs/testing-strategy.md.
 */
const QUESTIONS = [
  'Milyen gyakran öntözzem a szukkulenseimet?',
  'Miért sárgulnak a leveleim?',
  'Mennyi fényre van szüksége egy monsterának?',
  'Hogyan ismerem fel a pajzstetűt a növényemen?',
  'Milyen páratartalmat igényelnek a páfrányok?',
  'Hogyan ültessem át a növényemet nagyobb cserépbe?',
  'Hogyan gondozzam a Xylorhiza nevű ritka növényemet, amit egy expedícióról hoztam?', // negatív
  'Mit tegyek, ha nem néz ki jól a növényem?', // önreflektáló-retry jelölt
];

function formatChunk(chunk: SearchResult, metric: 'distance' | 'score', value: number): string {
  return `    [${metric}=${value.toFixed(3)}] ${chunk.title} (${chunk.source}) #${chunk.chunkIndex}`;
}

async function runQuestion(question: string, index: number): Promise<void> {
  console.log(`\n=== [${index}] ${question} ===`);

  // (1) Nyers vektorkeresés: a literal kérdés embeddje, HyDE/rerank nélkül.
  const [rawEmbedding] = await embedTexts([question]);
  const rawResults = await searchChunks(rawEmbedding, TOP_N);
  console.log(`  Nyers (top ${TOP_N}, distance szerint, literal kérdés embeddje):`);
  rawResults.forEach((chunk) => console.log(formatChunk(chunk, 'distance', chunk.distance)));

  // (2) Teljes pipeline: EGY HyDE-hívásból származó jelölt-halmaz, rerank előtt és után —
  // szándékosan nem hívjuk meg külön a retrieve()-et, mert az egy MÁSIK HyDE-hívást jelentene
  // (nem-determinisztikus), és a "rerank előtt/után" összevetés csak közös jelölt-halmazon érvényes.
  const hypotheticalAnswer = await generateHypotheticalAnswer(question);
  const [hydeEmbedding] = await embedTexts([hypotheticalAnswer]);
  const candidates = await searchChunks(hydeEmbedding, CANDIDATE_LIMIT);
  console.log(`  Pipeline jelöltek rerank ELŐTT (mind a ${CANDIDATE_LIMIT}, distance szerint):`);
  candidates.forEach((chunk) => console.log(formatChunk(chunk, 'distance', chunk.distance)));

  const ranked = await rerankChunks(question, candidates);
  console.log(`  Pipeline jelöltek rerank UTÁN (mind a ${CANDIDATE_LIMIT}, score szerint):`);
  ranked.forEach((chunk) => console.log(formatChunk(chunk, 'score', chunk.score)));

  const final = ranked.slice(0, TOP_N);
  const topScore = final[0]?.score ?? 0;
  const weak = topScore < WEAK_RESULT_SCORE_THRESHOLD;
  console.log(`  Végleges (top ${TOP_N}, ez megy az agentnek) — topScore=${topScore}, weak=${weak}:`);
  final.forEach((chunk) => console.log(formatChunk(chunk, 'score', chunk.score)));
}

async function main(): Promise<void> {
  const onlyIndex = process.argv[2] !== undefined ? Number(process.argv[2]) : undefined;

  for (const [index, question] of QUESTIONS.entries()) {
    if (onlyIndex !== undefined && index !== onlyIndex) continue;
    await runQuestion(question, index);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
