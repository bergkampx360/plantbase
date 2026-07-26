import { tool } from 'ai';
import { z } from 'zod';
import { retrieve } from './rag/retrieve';

const SearchKnowledgeInput = z.object({
  query: z
    .string()
    .min(1)
    .describe('A gondozási kérdés, amire a tudásbázisban választ keresünk.'),
});

export const SEARCH_KNOWLEDGE_TOOL = tool({
  description:
    'Növénygondozási tudásbázis keresése (HyDE + rerank pipeline). Releváns szövegrészleteket ad vissza forrás-hivatkozással és relevancia-pontszámmal (hitCount/topScore). Gondozási, betegség-, öntözés-, fényigény-jellegű kérdésekhez használd, nem a products katalógushoz.',
  inputSchema: SearchKnowledgeInput,
  execute: async (input) => {
    try {
      return await searchKnowledge(input);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  },
});

export async function searchKnowledge(input: unknown): Promise<string> {
  const { query } = SearchKnowledgeInput.parse(input);
  const result = await retrieve(query);
  return JSON.stringify(result);
}
