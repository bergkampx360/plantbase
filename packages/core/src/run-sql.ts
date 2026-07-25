import { z } from 'zod';
import { getPool } from './db-pool';

const RunSqlInput = z.object({
  query: z.string().min(1),
});

const FORBIDDEN_KEYWORDS =
  /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|exec|execute|copy|call)\b/i;

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
  const trimmed = query.trim();

  const masked = trimmed.replace(/['"`]([^'"`]|\\.)*['"`]/g, "''");
  const withoutTrailingSemicolon = masked.replace(/;\s*$/, '');

  if (!/^select\b/i.test(withoutTrailingSemicolon)) {
    throw new Error('Csak SELECT lekérdezés engedélyezett.');
  }
  if (withoutTrailingSemicolon.includes(';')) {
    throw new Error(
      'Pontosvesszővel elválasztott több lekérdezés nem engedélyezett.',
    );
  }
  if (FORBIDDEN_KEYWORDS.test(withoutTrailingSemicolon)) {
    throw new Error('A lekérdezés tiltott kulcsszót tartalmaz.');
  }

  const result = await getPool().query(trimmed);
  return JSON.stringify(result.rows);
}
