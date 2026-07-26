import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

/**
 * HyDE: egy hipotetikus válasz-bekezdést generálunk a kérdésre, és ezt embeddeljük
 * a valódi kérdés helyett — a hipotetikus válasz szemantikailag közelebb áll a
 * tudásbázis cikkeihez, mint egy rövid kérdés (docs/rag-pipeline.md).
 */
export async function generateHypotheticalAnswer(question: string): Promise<string> {
  const { text } = await generateText({
    model: anthropic(process.env['ANTHROPIC_MODEL'] ?? 'claude-haiku-4-5'),
    prompt: `Írj egy rövid (2-4 mondatos), hipotetikus választ a következő növénygondozási kérdésre, mintha egy szakértői gondozási cikkből származna. Csak a válasz szövegét add vissza, bevezető vagy magyarázat nélkül.\n\nKérdés: ${question}`,
  });

  return text;
}
