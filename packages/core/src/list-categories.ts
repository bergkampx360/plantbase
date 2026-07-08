import { z } from 'zod';
import { getPool } from './db-pool';

const ListCategoriesInput = z.object({});

export const LIST_CATEGORIES_TOOL = {
  name: 'listCategories',
  description: 'Az elérhető kategóriák listája, paraméter nélkül.',
  input_schema: {
    type: 'object' as const,
    properties: {},
  },
};

export async function listCategories(input: unknown): Promise<string> {
  ListCategoriesInput.parse(input);

  const result = await getPool().query(
    'SELECT DISTINCT category FROM products ORDER BY category',
  );
  return JSON.stringify(result.rows.map((row: { category: string }) => row.category));
}
