import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { resolveModel } from './ask-agent';

/**
 * Rövid, 2-4 szavas cím generálása egy beszélgetés első kérdéséből — a webes
 * chat history-sávjában jelenik meg (docs/implementation/07-web-ux-improvements.md,
 * H3). Nyers karakter/mondat-csonkolás helyett, mert az fura, félbevágott
 * címeket adhatna, különösen magyar, ragozott mondatszerkezeteknél — ugyanígy
 * csinálja a ChatGPT/Claude.ai is.
 */
export async function generateThreadTitle(question: string): Promise<string> {
  const { text } = await generateText({
    model: anthropic(resolveModel()),
    prompt: `Adj egy rövid, 2-4 szavas címet a következő kérdéshez, mintha egy chat-beszélgetés listájában jelenne meg. Csak a címet add vissza, idézőjel, írásjel vagy magyarázat nélkül.\n\nKérdés: ${question}`,
  });

  return text.trim();
}
