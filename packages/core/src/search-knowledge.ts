import { z } from 'zod';
import { retrieve } from './rag/retrieve';

const SearchKnowledgeInput = z.object({
  query: z.string().min(1),
});

export const SEARCH_KNOWLEDGE_TOOL = {
  name: 'searchKnowledge',
  description:
    'Növénygondozási tudásbázis keresése (HyDE + rerank pipeline). Releváns szövegrészleteket ad vissza forrás-hivatkozással és relevancia-pontszámmal (hitCount/topScore). Gondozási, betegség-, öntözés-, fényigény-jellegű kérdésekhez használd, nem a products katalógushoz.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string' as const,
        description: 'A gondozási kérdés, amire a tudásbázisban választ keresünk.',
      },
    },
    required: ['query'],
  },
};

export async function searchKnowledge(input: unknown): Promise<string> {
  const { query } = SearchKnowledgeInput.parse(input);
  const result = await retrieve(query);
  return JSON.stringify(result);
}
