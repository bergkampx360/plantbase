import { describe, expect, it, vi } from 'vitest';

const { embedManyMock } = vi.hoisted(() => ({ embedManyMock: vi.fn() }));

vi.mock('ai', () => ({
  embedMany: embedManyMock,
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: {
    textEmbeddingModel: vi.fn().mockReturnValue('mock-embedding-model'),
  },
}));

import { embedTexts } from './embed';

describe('embedTexts', () => {
  it('returns an empty array without calling embedMany when given no texts', async () => {
    const result = await embedTexts([]);

    expect(result).toEqual([]);
    expect(embedManyMock).not.toHaveBeenCalled();
  });

  it('embeds all texts in one embedMany call and returns the embeddings in order', async () => {
    embedManyMock.mockResolvedValue({
      embeddings: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
      usage: { tokens: 12 },
    });

    const result = await embedTexts(['first chunk', 'second chunk']);

    expect(embedManyMock).toHaveBeenCalledWith({
      model: 'mock-embedding-model',
      values: ['first chunk', 'second chunk'],
    });
    expect(result).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
  });
});
