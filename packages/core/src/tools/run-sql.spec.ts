import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../infra/db-pool';
import { RUN_SQL_TOOL, runSql } from './run-sql';

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

describe('runSql', () => {
  it('runs a valid SELECT query against the pool and returns rows as JSON', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 1, name: 'Monstera' }] });

    const result = await runSql({ query: '  select * from products  ' });

    expect(queryMock).toHaveBeenCalledWith('select * from products');
    expect(result).toBe(JSON.stringify([{ id: 1, name: 'Monstera' }]));
  });

  it('rejects queries that do not start with SELECT', async () => {
    await expect(
      runSql({ query: 'UPDATE products SET price = 0' }),
    ).rejects.toThrow('Csak SELECT lekérdezés engedélyezett.');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rejects multi-statement queries separated by a semicolon', async () => {
    await expect(
      runSql({ query: 'SELECT * FROM products; DROP TABLE products' }),
    ).rejects.toThrow(
      'Pontosvesszővel elválasztott több lekérdezés nem engedélyezett.',
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rejects queries containing a blacklisted keyword even without a semicolon', async () => {
    await expect(
      runSql({
        query:
          "SELECT * FROM products WHERE name = 'x' AND EXISTS (DELETE FROM products)",
      }),
    ).rejects.toThrow('A lekérdezés tiltott kulcsszót tartalmaz.');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('does not false-positive on column names containing a blacklisted substring', async () => {
    queryMock.mockResolvedValue({ rows: [{ insert_date: '2026-01-01' }] });

    const result = await runSql({
      query: 'SELECT insert_date FROM products LIMIT 1',
    });

    expect(queryMock).toHaveBeenCalledWith(
      'SELECT insert_date FROM products LIMIT 1',
    );
    expect(result).toBe(JSON.stringify([{ insert_date: '2026-01-01' }]));
  });

  it('rejects input that fails schema validation', async () => {
    await expect(runSql({ query: '' })).rejects.toThrow();
    await expect(runSql({})).rejects.toThrow();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('allows blacklisted keywords inside string literals', async () => {
    queryMock.mockResolvedValue({ rows: [{ name: 'test plant' }] });

    const result = await runSql({
      query: "SELECT * FROM products WHERE name LIKE '%insert%'",
    });

    expect(queryMock).toHaveBeenCalledWith(
      "SELECT * FROM products WHERE name LIKE '%insert%'",
    );
    expect(result).toBe(JSON.stringify([{ name: 'test plant' }]));
  });

  it('allows multiple blacklisted keywords in string literals', async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: 1, status: 'drop_zone' }],
    });

    const result = await runSql({
      query:
        "SELECT * FROM products WHERE id IN ('1', 'drop') AND status = 'delete'",
    });

    expect(queryMock).toHaveBeenCalledWith(
      "SELECT * FROM products WHERE id IN ('1', 'drop') AND status = 'delete'",
    );
    expect(result).toBe(JSON.stringify([{ id: 1, status: 'drop_zone' }]));
  });

  it('allows a single trailing semicolon', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 1, name: 'Monstera' }] });

    const result = await runSql({ query: 'SELECT * FROM products;' });

    expect(queryMock).toHaveBeenCalledWith('SELECT * FROM products;');
    expect(result).toBe(JSON.stringify([{ id: 1, name: 'Monstera' }]));
  });

  it('allows a trailing semicolon followed by whitespace', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 1, name: 'Monstera' }] });

    const result = await runSql({ query: 'SELECT * FROM products;  \n' });

    expect(queryMock).toHaveBeenCalledWith('SELECT * FROM products;');
    expect(result).toBe(JSON.stringify([{ id: 1, name: 'Monstera' }]));
  });

  it('still rejects a semicolon followed by another statement', async () => {
    await expect(
      runSql({ query: 'SELECT * FROM products; DROP TABLE products' }),
    ).rejects.toThrow(
      'Pontosvesszővel elválasztott több lekérdezés nem engedélyezett.',
    );
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('RUN_SQL_TOOL.execute', () => {
  it('catches a runSql validation error and returns it as a plain string instead of throwing', async () => {
    const output = await RUN_SQL_TOOL.execute?.(
      { query: 'DROP TABLE products' },
      { toolCallId: 'test', messages: [] },
    );

    expect(output).toBe('Csak SELECT lekérdezés engedélyezett.');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('returns the row JSON on a successful query, same as runSql directly', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 1, name: 'Monstera' }] });

    const output = await RUN_SQL_TOOL.execute?.(
      { query: 'SELECT * FROM products' },
      { toolCallId: 'test', messages: [] },
    );

    expect(output).toBe(JSON.stringify([{ id: 1, name: 'Monstera' }]));
  });
});
