import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../infra/db-pool';
import { SEARCH_PRODUCTS_TOOL, searchProducts } from './search-products';

vi.mock('../infra/db-pool', () => ({
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

describe('searchProducts', () => {
  it('always filters to in-stock rows and applies the fixed LIMIT, even with no filters', async () => {
    queryMock.mockResolvedValue({ rows: [{ name: 'Monstera' }] });

    const result = await searchProducts({});

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('stock > 0'), []);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('LIMIT 20'), []);
    expect(result).toBe(JSON.stringify([{ name: 'Monstera' }]));
  });

  it('builds a parameterized WHERE clause for each provided filter', async () => {
    queryMock.mockResolvedValue({ rows: [] });

    await searchProducts({
      category: 'kaktusz',
      light: 'erős',
      watering: 'ritka',
      difficulty: 'kezdő',
      petSafe: true,
      kidSafe: true,
      airPurifying: false,
      maxPrice: 5000,
    });

    const [query, values] = queryMock.mock.calls[0];
    expect(query).toContain('category = $1');
    expect(query).toContain('light = $2');
    expect(query).toContain('watering = $3');
    expect(query).toContain('difficulty = $4');
    expect(query).toContain('pet_safe = $5');
    expect(query).toContain('kid_safe = $6');
    expect(query).toContain('air_purifying = $7');
    expect(query).toContain('COALESCE(sale_price, price) <= $8');
    expect(values).toEqual([
      'kaktusz',
      'erős',
      'ritka',
      'kezdő',
      true,
      true,
      false,
      5000,
    ]);
  });

  it('rejects a category outside the known value set', async () => {
    await expect(
      searchProducts({ category: 'not-a-real-category' }),
    ).rejects.toThrow();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rejects a negative or zero maxPrice', async () => {
    await expect(searchProducts({ maxPrice: 0 })).rejects.toThrow();
    await expect(searchProducts({ maxPrice: -10 })).rejects.toThrow();
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('SEARCH_PRODUCTS_TOOL.execute', () => {
  it('catches a query rejection and returns it as a plain string instead of throwing', async () => {
    queryMock.mockRejectedValue(new Error('connection refused'));

    const output = await SEARCH_PRODUCTS_TOOL.execute?.(
      {},
      { toolCallId: 'test', messages: [] },
    );

    expect(output).toBe('connection refused');
  });

  it('returns the row JSON on a successful query, same as searchProducts directly', async () => {
    queryMock.mockResolvedValue({ rows: [{ name: 'Aloe' }] });

    const output = await SEARCH_PRODUCTS_TOOL.execute?.(
      { category: 'pozsgás' },
      { toolCallId: 'test', messages: [] },
    );

    expect(output).toBe(JSON.stringify([{ name: 'Aloe' }]));
  });
});
