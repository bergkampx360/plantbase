import type { AskResult } from '@plantbase/core';
import { formatMessages } from './format-messages';

const SEPARATOR = '─'.repeat(60);

export function printTurn(
  question: string,
  result: AskResult,
  options?: { showPrompt?: boolean },
): void {
  console.log(SEPARATOR);
  console.log(`🙋 Te: ${question}`);
  if (options?.showPrompt) {
    console.log(formatMessages(result.messages));
  }
  console.log(`🌱 Plantbase: ${result.answer}`);
}
