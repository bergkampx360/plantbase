import Anthropic from '@anthropic-ai/sdk';
import { logInteraction } from './log-interaction';
import { RUN_SQL_TOOL, runSql } from './run-sql';
import { SYSTEM_PROMPT } from './system-prompt';

export type AskResult = {
  answer: string;
  // teljes csere — ezt írja ki a --show-prompt (FR5)
  messages: Anthropic.MessageParam[];
  tokenUsage: { inputTokens: number; outputTokens: number };
  // kényelmi kivonat a messages tömbből a JSONL loghoz (FR4) — maga a SQL
  // a tool_use blokkban is megtalálható
  generatedSql?: string;
};

const MAX_TOOL_ITERATIONS = 5;

export async function askAgent(question: string): Promise<AskResult> {
  // a kliens szándékosan itt jön létre, nem modul-szinten: a CLI induláskor
  // tölti be a .env-et (lásd apps/cli/src/main.ts), ami csak ezután fut le
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: question }];
  const tokenUsage = { inputTokens: 0, outputTokens: 0 };
  let generatedSql: string | undefined;
  let answer = '';

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await client.messages.create({
      model: process.env['ANTHROPIC_MODEL'] ?? 'claude-haiku-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [RUN_SQL_TOOL],
      messages,
    });

    tokenUsage.inputTokens += response.usage.input_tokens;
    tokenUsage.outputTokens += response.usage.output_tokens;
    messages.push({ role: 'assistant', content: response.content });

    answer = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    if (response.stop_reason !== 'tool_use') {
      break;
    }

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      if (toolUse.name !== 'runSql') {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Ismeretlen tool: ${toolUse.name}`,
          is_error: true,
        });
        continue;
      }

      const input = toolUse.input as { query?: string };
      generatedSql = input.query ?? generatedSql;

      try {
        const content = await runSql(toolUse.input);
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content });
      } catch (error) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: error instanceof Error ? error.message : String(error),
          is_error: true,
        });
      }
    }

    messages.push({ role: 'user', content: toolResults });
  }

  const result: AskResult = { answer, messages, tokenUsage, generatedSql };

  await logInteraction({
    system: SYSTEM_PROMPT,
    messages: result.messages,
    answer: result.answer,
    tokenUsage: result.tokenUsage,
    generatedSql: result.generatedSql,
  });

  return result;
}
