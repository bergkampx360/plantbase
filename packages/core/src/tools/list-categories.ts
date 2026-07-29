import { tool } from 'ai';
import { z } from 'zod';
import { getPool } from '../infra/db-pool';

const ListCategoriesInput = z.object({});

export const LIST_CATEGORIES_TOOL = tool({
  description: 'Az elérhető kategóriák listája, paraméter nélkül.',
  inputSchema: ListCategoriesInput,
  execute: async (input) => {
    try {
      return await listCategories(input);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  },
});

export async function listCategories(input: unknown): Promise<string> {
  ListCategoriesInput.parse(input);

  const result = await getPool().query(
    'SELECT DISTINCT category FROM products ORDER BY category',
  );
  return JSON.stringify(
    result.rows.map((row: { category: string }) => row.category),
  );
}
