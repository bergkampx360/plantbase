import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';

export interface InteractionLog {
  system: string;
  messages: Anthropic.MessageParam[];
  answer: string;
  tokenUsage: { inputTokens: number; outputTokens: number };
  generatedSql?: string;
}

export async function logInteraction(log: InteractionLog): Promise<void> {
  const dir = join(process.cwd(), 'logs');
  await mkdir(dir, { recursive: true });
  const file = join(
    dir,
    `${new Date().toISOString().replace(/:/g, '-')}.jsonl`,
  );
  await appendFile(file, `${JSON.stringify(log)}\n`);
}
