import { z } from 'zod';
import { getPool } from './db-pool';

const RunSqlInput = z.object({
  query: z.string().min(1),
});

export const RUN_SQL_TOOL = {
  name: 'runSql',
  description:
    'Read-only SQL lekérdezés futtatása a products katalóguson. Csak SELECT engedélyezett.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string' as const,
        description: 'A futtatandó SELECT SQL lekérdezés.',
      },
    },
    required: ['query'],
  },
};

export async function runSql(input: unknown): Promise<string> {
  const { query } = RunSqlInput.parse(input);

  if (!/^select\b/i.test(query.trim())) {
    throw new Error('Csak SELECT lekérdezés engedélyezett.');
  }

  const result = await getPool().query(query);
  return JSON.stringify(result.rows);
}
