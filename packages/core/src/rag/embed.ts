import { openai } from '@ai-sdk/openai';
import { embedMany } from 'ai';

const EMBEDDING_MODEL = 'text-embedding-3-small';

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const { embeddings } = await embedMany({
    model: openai.textEmbeddingModel(EMBEDDING_MODEL),
    values: texts,
  });

  return embeddings;
}
