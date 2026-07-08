import Anthropic from '@anthropic-ai/sdk';
import { logInteraction } from './log-interaction';

export type AskResult = {
  answer: string;
  // teljes csere — ezt írja ki a --show-prompt (B3, FR5)
  messages: Anthropic.MessageParam[];
  tokenUsage: { inputTokens: number; outputTokens: number };
};

const SYSTEM_PROMPT = `Te a Plantbase asszisztens vagy: egy lakberendezőnek (és otthoni felhasználóknak) segítesz növényt választani és növénycsomagot összeállítani egy webshop katalógusa alapján.

Jelenleg NINCS adatbázis-hozzáférésed a katalógushoz. Ha a kérdés konkrét termékre, árra, készletre vagy más katalógus-adatra vonatkozik, mondd meg ezt őszintén, és NE találj ki adatot.`;

export async function askAgent(question: string): Promise<AskResult> {
  // a kliens szándékosan itt jön létre, nem modul-szinten: a CLI induláskor
  // tölti be a .env-et (lásd apps/cli/src/main.ts), ami csak ezután fut le
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: question },
  ];

  const response = await client.messages.create({
    model: process.env['ANTHROPIC_MODEL'] ?? 'claude-haiku-4-5',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages,
  });

  const answer = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  const result: AskResult = {
    answer,
    messages: [...messages, { role: 'assistant', content: response.content }],
    tokenUsage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };

  await logInteraction({
    system: SYSTEM_PROMPT,
    messages: result.messages,
    answer: result.answer,
    tokenUsage: result.tokenUsage,
  });

  return result;
}
