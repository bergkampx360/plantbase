import { tool } from 'ai';
import { z } from 'zod';
import { getPool } from '../infra/db-pool';

// Érték-készletek docs/stack.md szerint (ugyanaz, mint amit a belső system-prompt.ts <schema>
// szakasza is dokumentál a lakberendezői agentnek).
const SearchProductsInput = z.object({
  category: z
    .enum([
      'szobanövény',
      'kerti',
      'pozsgás',
      'kaktusz',
      'fűszer',
      'fa-cserje',
      'lógó',
      'virágzó',
    ])
    .optional(),
  light: z
    .enum(['árnyék', 'alacsony', 'közepes', 'erős', 'direkt nap'])
    .optional(),
  watering: z
    .enum(['ritka', 'közepes', 'gyakori', 'állandóan nedves'])
    .optional(),
  difficulty: z.enum(['kezdő', 'haladó', 'profi']).optional(),
  petSafe: z.boolean().optional(),
  kidSafe: z.boolean().optional(),
  airPurifying: z.boolean().optional(),
  maxPrice: z.number().positive().optional(),
});

export const SEARCH_PRODUCTS_TOOL = tool({
  description:
    'Ügyfél-biztonságos, szűrt termékkeresés a products katalóguson (kategória, fény-/' +
    'öntözési igény, nehézségi szint, háziállat-/gyerekbiztonság, légtisztító hatás, ' +
    'maximum ár). Csak készleten lévő termékeket ad vissza, legfeljebb 20 találatot. Nem ' +
    'futtat szabad SQL-t — publikus felületről ezt sosem szabad elérhetővé tenni.',
  inputSchema: SearchProductsInput,
  execute: async (input) => {
    try {
      return await searchProducts(input);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  },
});

export async function searchProducts(input: unknown): Promise<string> {
  const parsed = SearchProductsInput.parse(input);

  const conditions: string[] = ['stock > 0'];
  const values: unknown[] = [];

  if (parsed.category !== undefined) {
    values.push(parsed.category);
    conditions.push(`category = $${values.length}`);
  }
  if (parsed.light !== undefined) {
    values.push(parsed.light);
    conditions.push(`light = $${values.length}`);
  }
  if (parsed.watering !== undefined) {
    values.push(parsed.watering);
    conditions.push(`watering = $${values.length}`);
  }
  if (parsed.difficulty !== undefined) {
    values.push(parsed.difficulty);
    conditions.push(`difficulty = $${values.length}`);
  }
  if (parsed.petSafe !== undefined) {
    values.push(parsed.petSafe);
    conditions.push(`pet_safe = $${values.length}`);
  }
  if (parsed.kidSafe !== undefined) {
    values.push(parsed.kidSafe);
    conditions.push(`kid_safe = $${values.length}`);
  }
  if (parsed.airPurifying !== undefined) {
    values.push(parsed.airPurifying);
    conditions.push(`air_purifying = $${values.length}`);
  }
  if (parsed.maxPrice !== undefined) {
    values.push(parsed.maxPrice);
    conditions.push(`COALESCE(sale_price, price) <= $${values.length}`);
  }

  // Fix oszloplista, fix LIMIT — a szűrők értékei mindig paraméterezve mennek (sosem
  // string-interpolációval), az oszlopnevek pedig sosem felhasználói inputból származnak,
  // tehát ez a query-építés SQL-injection szempontból biztonságos akkor is, ha a fenti
  // feltétel-lista bővülne.
  const result = await getPool().query(
    `SELECT name, latin_name, category, COALESCE(sale_price, price) AS price, stock,
            light, watering, difficulty, pet_safe, kid_safe, air_purifying, description
     FROM products
     WHERE ${conditions.join(' AND ')}
     ORDER BY rating DESC
     LIMIT 20`,
    values,
  );

  return JSON.stringify(result.rows);
}
