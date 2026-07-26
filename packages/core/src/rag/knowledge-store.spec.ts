import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, getWritePool } from '../db-pool';

vi.mock('../db-pool', () => ({
  getPool: vi.fn(),
  getWritePool: vi.fn(),
}));

import {
  clearKnowledge,
  insertChunks,
  searchChunks,
  toStoredChunks,
} from './knowledge-store';

const mockedGetPool = vi.mocked(getPool);
const mockedGetWritePool = vi.mocked(getWritePool);
const readQueryMock = vi.fn();
const writeQueryMock = vi.fn();

beforeEach(() => {
  readQueryMock.mockReset();
  writeQueryMock.mockReset();
  mockedGetPool.mockReturnValue({
    query: readQueryMock,
  } as unknown as ReturnType<typeof getPool>);
  mockedGetWritePool.mockReturnValue({
    query: writeQueryMock,
  } as unknown as ReturnType<typeof getWritePool>);
});

describe('searchChunks', () => {
  it('queries the RO pool with a pgvector literal and returns the rows', async () => {
    readQueryMock.mockResolvedValue({
      rows: [
        {
          source: 'x.md',
          title: 'Snake Plant Care',
          category: 'plants-101',
          chunkIndex: 0,
          content: 'Snake Plant Care\n\nWater it sometimes.',
          distance: 0.12,
        },
      ],
    });

    const result = await searchChunks([0.1, 0.2, 0.3], 5);

    expect(readQueryMock).toHaveBeenCalledWith(expect.stringContaining('<=>'), [
      '[0.1,0.2,0.3]',
      5,
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Snake Plant Care');
  });
});

describe('insertChunks', () => {
  it('does nothing when given no chunks', async () => {
    await insertChunks([]);
    expect(writeQueryMock).not.toHaveBeenCalled();
  });

  it('inserts each chunk via the RW pool with a pgvector literal', async () => {
    writeQueryMock.mockResolvedValue({});

    await insertChunks([
      {
        source: 'x.md',
        title: 'Snake Plant Care',
        category: 'plants-101',
        chunkIndex: 0,
        content: 'Snake Plant Care\n\nWater it sometimes.',
        embedding: [0.1, 0.2],
      },
    ]);

    expect(writeQueryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO knowledge_chunks'),
      ['x.md', 'Snake Plant Care', 'plants-101', 0, 'Snake Plant Care\n\nWater it sometimes.', '[0.1,0.2]'],
    );
  });
});

describe('clearKnowledge', () => {
  it('truncates the knowledge_chunks table via the RW pool', async () => {
    writeQueryMock.mockResolvedValue({});

    await clearKnowledge();

    expect(writeQueryMock).toHaveBeenCalledWith('TRUNCATE TABLE knowledge_chunks');
  });
});

describe('toStoredChunks', () => {
  it('zips article chunks with their embeddings in order', () => {
    const result = toStoredChunks(
      'x.md',
      'Snake Plant Care',
      'plants-101',
      [
        { chunkIndex: 0, content: 'Intro' },
        { chunkIndex: 1, content: 'Water section' },
      ],
      [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
    );

    expect(result).toEqual([
      {
        source: 'x.md',
        title: 'Snake Plant Care',
        category: 'plants-101',
        chunkIndex: 0,
        content: 'Intro',
        embedding: [0.1, 0.2],
      },
      {
        source: 'x.md',
        title: 'Snake Plant Care',
        category: 'plants-101',
        chunkIndex: 1,
        content: 'Water section',
        embedding: [0.3, 0.4],
      },
    ]);
  });
});
