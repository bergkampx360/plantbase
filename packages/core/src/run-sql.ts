import { tool } from 'ai';
import { z } from 'zod';
import { getPool } from './db-pool';

const RunSqlInput = z.object({
  query: z.string().min(1).describe('A futtatandó SELECT SQL lekérdezés.'),
});

const FORBIDDEN_KEYWORDS =
  /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|exec|execute|copy|call)\b/i;

export const RUN_SQL_TOOL = tool({
  description:
    'Read-only SQL lekérdezés futtatása a products katalóguson. Csak SELECT engedélyezett.',
  inputSchema: RunSqlInput,
  // a runSql maga throw-ol validációs hibán (lásd lent) — az AI SDK egy execute-ból
  // dobott hibát ToolExecutionError-ként az egész streamText-hívást megszakítva
  // kezelné, nem hiba-tool-result-ként, ezért itt fogjuk el és adjuk vissza szövegként,
  // hogy a modell lássa a hibát és önreflektáló módon újrapróbálkozhasson
  execute: async (input) => {
    try {
      return await runSql(input);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  },
});

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
