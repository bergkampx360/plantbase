import { getPool, getWritePool } from '../db-pool';
import type { ArticleChunk } from './chunk';

export interface StoredChunk {
  source: string;
  title: string;
  category: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
}

export interface SearchResult {
  source: string;
  title: string;
  category: string;
  chunkIndex: number;
  content: string;
  distance: number;
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Agent-facing olvasás — a meglévő RO pool-on, ugyanaz az NFR1 elv, mint a runSql-nél
 * (docs/architektura.md döntés #2).
 */
export async function searchChunks(
  queryEmbedding: number[],
  limit: number,
): Promise<SearchResult[]> {
  const result = await getPool().query(
    `SELECT source, title, category, chunk_index AS "chunkIndex", content,
            embedding <=> $1 AS distance
       FROM knowledge_chunks
      ORDER BY embedding <=> $1
      LIMIT $2`,
    [toVectorLiteral(queryEmbedding), limit],
  );
  return result.rows;
}

/**
 * Ingest-célú írás — kizárólag az ingest-scriptből fut, az új RW pool-on
 * (docs/architektura.md döntés #2, sosem az agent útján).
 */
export async function insertChunks(chunks: StoredChunk[]): Promise<void> {
  if (chunks.length === 0) return;

  const pool = getWritePool();
  for (const chunk of chunks) {
    await pool.query(
      `INSERT INTO knowledge_chunks (source, title, category, chunk_index, content, embedding)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        chunk.source,
        chunk.title,
        chunk.category,
        chunk.chunkIndex,
        chunk.content,
        toVectorLiteral(chunk.embedding),
      ],
    );
  }
}

export async function clearKnowledge(): Promise<void> {
  await getWritePool().query('TRUNCATE TABLE knowledge_chunks');
}

export function toStoredChunks(
  source: string,
  title: string,
  category: string,
  chunks: ArticleChunk[],
  embeddings: number[][],
): StoredChunk[] {
  return chunks.map((chunk, i) => ({
    source,
    title,
    category,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    embedding: embeddings[i],
  }));
}
