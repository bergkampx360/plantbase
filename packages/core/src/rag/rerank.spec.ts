import { describe, expect, it, vi } from 'vitest';
import type { SearchResult } from './knowledge-store';

const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));

vi.mock('ai', () => ({
  generateObject: generateObjectMock,
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn().mockReturnValue('mock-openai-model'),
}));

import { rerankChunks } from './rerank';

function candidate(overrides: Partial<SearchResult>): SearchResult {
  return {
    source: 'ontozes.md',
    title: 'Öntözés',
    category: 'gondozás',
    chunkIndex: 0,
    content: 'placeholder',
    distance: 0.1,
    ...overrides,
  };
}

describe('rerankChunks', () => {
  it('returns an empty array without calling generateObject when given no candidates', async () => {
    const result = await rerankChunks('kérdés', []);

    expect(result).toEqual([]);
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it('attaches scores by index and sorts candidates descending by score', async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        scores: [
          { index: 0, score: 2 },
          { index: 1, score: 8 },
        ],
      },
    });

    const candidates = [
      candidate({ content: 'kevésbé releváns' }),
      candidate({ content: 'nagyon releváns' }),
    ];

    const result = await rerankChunks('mikor öntözzem?', candidates);

    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'mock-openai-model' }),
    );
    expect(result).toEqual([
      { ...candidates[1], score: 8 },
      { ...candidates[0], score: 2 },
    ]);
  });

  it('defaults to a score of 0 for candidates missing from the model output', async () => {
    generateObjectMock.mockResolvedValue({ object: { scores: [{ index: 0, score: 5 }] } });

    const candidates = [candidate({}), candidate({})];
    const result = await rerankChunks('kérdés', candidates);

    expect(result[0].score).toBe(5);
    expect(result[1].score).toBe(0);
  });
});
