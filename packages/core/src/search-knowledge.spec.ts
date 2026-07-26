import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./rag/retrieve', () => ({ retrieve: vi.fn() }));

import { retrieve } from './rag/retrieve';
import { searchKnowledge } from './search-knowledge';

const mockedRetrieve = vi.mocked(retrieve);

beforeEach(() => {
  mockedRetrieve.mockReset();
});

describe('searchKnowledge', () => {
  it('runs the retrieval pipeline for the given query and returns the result as JSON', async () => {
    const retrievalResult = {
      chunks: [
        {
          source: 'ontozes.md',
          title: 'Öntözés',
          category: 'gondozás',
          chunkIndex: 0,
          content: 'Öntözd hetente egyszer.',
          distance: 0.1,
          score: 9,
        },
      ],
      hitCount: 1,
      topScore: 9,
      weak: false,
    };
    mockedRetrieve.mockResolvedValue(retrievalResult);

    const result = await searchKnowledge({
      query: 'mikor öntözzem a monsterát?',
    });

    expect(mockedRetrieve).toHaveBeenCalledWith('mikor öntözzem a monsterát?');
    expect(result).toBe(JSON.stringify(retrievalResult));
  });

  it('rejects input that fails schema validation', async () => {
    await expect(searchKnowledge({ query: '' })).rejects.toThrow();
    await expect(searchKnowledge({})).rejects.toThrow();
    expect(mockedRetrieve).not.toHaveBeenCalled();
  });
});
