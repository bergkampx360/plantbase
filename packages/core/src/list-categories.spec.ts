import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from './db-pool';
import { listCategories } from './list-categories';

vi.mock('./db-pool', () => ({
  getPool: vi.fn(),
}));

const mockedGetPool = vi.mocked(getPool);
const queryMock = vi.fn();

beforeEach(() => {
  queryMock.mockReset();
  mockedGetPool.mockReturnValue({
    query: queryMock,
  } as unknown as ReturnType<typeof getPool>);
});

describe('listCategories', () => {
  it('queries distinct categories ordered alphabetically and returns them as JSON', async () => {
    queryMock.mockResolvedValue({
      rows: [{ category: 'kaktusz' }, { category: 'pozsgás' }],
    });

    const result = await listCategories({});

    expect(queryMock).toHaveBeenCalledWith(
      'SELECT DISTINCT category FROM products ORDER BY category',
    );
    expect(result).toBe(JSON.stringify(['kaktusz', 'pozsgás']));
  });

  it('returns an empty array when there are no categories', async () => {
    queryMock.mockResolvedValue({ rows: [] });

    const result = await listCategories({});

    expect(result).toBe('[]');
  });

  it('ignores unexpected extra input properties (schema takes no parameters)', async () => {
    queryMock.mockResolvedValue({ rows: [{ category: 'kaktusz' }] });

    const result = await listCategories({ unexpected: 'value' });

    expect(queryMock).toHaveBeenCalled();
    expect(result).toBe(JSON.stringify(['kaktusz']));
  });
});
