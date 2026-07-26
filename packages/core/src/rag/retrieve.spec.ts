import { describe, expect, it, vi } from 'vitest';

vi.mock('./hyde', () => ({ generateHypotheticalAnswer: vi.fn() }));
vi.mock('./embed', () => ({ embedTexts: vi.fn() }));
vi.mock('./knowledge-store', () => ({ searchChunks: vi.fn() }));
vi.mock('./rerank', () => ({ rerankChunks: vi.fn() }));

import { embedTexts } from './embed';
import { generateHypotheticalAnswer } from './hyde';
import { searchChunks } from './knowledge-store';
import { rerankChunks } from './rerank';
import { retrieve } from './retrieve';

const mockedGenerateHyde = vi.mocked(generateHypotheticalAnswer);
const mockedEmbedTexts = vi.mocked(embedTexts);
const mockedSearchChunks = vi.mocked(searchChunks);
const mockedRerankChunks = vi.mocked(rerankChunks);

function chunk(score: number) {
  return {
    source: 'ontozes.md',
    title: 'Öntözés',
    category: 'gondozás',
    chunkIndex: 0,
    content: `chunk-${score}`,
    distance: 0.1,
    score,
  };
}

describe('retrieve', () => {
  it('runs the full pipeline in order and returns the top-N ranked chunks with hit metadata', async () => {
    mockedGenerateHyde.mockResolvedValue('hipotetikus válasz');
    mockedEmbedTexts.mockResolvedValue([[0.1, 0.2]]);
    mockedSearchChunks.mockResolvedValue([{ ...chunk(0), distance: 0.1 }]);
    mockedRerankChunks.mockResolvedValue([chunk(9), chunk(7), chunk(5), chunk(3), chunk(1)]);

    const result = await retrieve('mikor öntözzem a monsterát?');

    expect(mockedGenerateHyde).toHaveBeenCalledWith('mikor öntözzem a monsterát?');
    expect(mockedEmbedTexts).toHaveBeenCalledWith(['hipotetikus válasz']);
    expect(mockedSearchChunks).toHaveBeenCalledWith([0.1, 0.2], 10);
    expect(mockedRerankChunks).toHaveBeenCalledWith(
      'mikor öntözzem a monsterát?',
      expect.any(Array),
    );

    expect(result.chunks).toHaveLength(4);
    expect(result.hitCount).toBe(4);
    expect(result.topScore).toBe(9);
  });

  it('reports zero hits and zero top score when nothing is found', async () => {
    mockedGenerateHyde.mockResolvedValue('hipotetikus válasz');
    mockedEmbedTexts.mockResolvedValue([[0.1, 0.2]]);
    mockedSearchChunks.mockResolvedValue([]);
    mockedRerankChunks.mockResolvedValue([]);

    const result = await retrieve('van valami a marslakó növényekről?');

    expect(result.chunks).toEqual([]);
    expect(result.hitCount).toBe(0);
    expect(result.topScore).toBe(0);
  });
});
