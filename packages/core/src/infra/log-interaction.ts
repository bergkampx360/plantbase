import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ModelMessage } from 'ai';

export interface InteractionLog {
  system: string;
  messages: ModelMessage[];
  answer: string;
  tokenUsage: { inputTokens: number; outputTokens: number };
  generatedSql?: string;
  // J4 (HF5, docs/implementation/09-customer-facing-poc.md) — additív, opcionális mezők a
  // mérési tervhez: válaszidő és eszkalációs arány valós adatforrása, új infrastruktúra
  // nélkül. Régi log-sorokban (J4 előtt) nincsenek, ezért mindhárom opcionális.
  durationMs?: number;
  escalated?: boolean;
  persona?: 'internal' | 'customer';
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
