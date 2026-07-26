import { anthropic } from '@ai-sdk/anthropic';
import { stepCountIs, streamText, type ModelMessage } from 'ai';
import { LIST_CATEGORIES_TOOL } from './list-categories';
import { logInteraction } from './log-interaction';
import { RUN_SQL_TOOL } from './run-sql';
import { SEARCH_KNOWLEDGE_TOOL } from './search-knowledge';
import { SYSTEM_PROMPT } from './system-prompt';

export type AskResult = {
  answer: string;
  // teljes csere — ezt írja ki a --show-prompt (FR5)
  messages: ModelMessage[];
  tokenUsage: { inputTokens: number; outputTokens: number };
  // kényelmi kivonat a messages tömbből a JSONL loghoz (FR4) — maga a SQL
  // a tool-call részben is megtalálható
  generatedSql?: string;
};

export const MAX_TOOL_ITERATIONS = 5;

export function resolveModel(): string {
  return process.env['ANTHROPIC_MODEL'] ?? 'claude-haiku-4-5';
}

export async function askAgent(
  question: string,
  history: ModelMessage[] = [],
): Promise<AskResult> {
  const messages: ModelMessage[] = [
    ...history,
    { role: 'user', content: question },
  ];

  const result = streamText({
    model: anthropic(resolveModel()),
    system: SYSTEM_PROMPT,
    messages,
    tools: {
      runSql: RUN_SQL_TOOL,
      listCategories: LIST_CATEGORIES_TOOL,
      searchKnowledge: SEARCH_KNOWLEDGE_TOOL,
    },
    stopWhen: stepCountIs(MAX_TOOL_ITERATIONS),
  });

  const [answer, totalUsage, response, steps] = await Promise.all([
    result.text,
    result.totalUsage,
    result.response,
    result.steps,
  ]);

  // az utolsó runSql-hívás számít (ha a modell több próbálkozást is tett,
  // a végleges válaszhoz vezető lekérdezés az utolsó) — ugyanaz a szemantika,
  // mint a korábbi kézzel írt loopban volt
  const runSqlCalls = steps
    .flatMap((step) => step.toolCalls)
    .filter((toolCall) => toolCall.toolName === 'runSql');
  const runSqlCall = runSqlCalls[runSqlCalls.length - 1];
  const generatedSql =
    runSqlCall && typeof runSqlCall.input === 'object' && runSqlCall.input
      ? (runSqlCall.input as { query?: string }).query
      : undefined;

  const finalResult: AskResult = {
    answer,
    messages: [...messages, ...response.messages],
    tokenUsage: {
      inputTokens: totalUsage.inputTokens ?? 0,
      outputTokens: totalUsage.outputTokens ?? 0,
    },
    generatedSql,
  };

  await logInteraction({
    system: SYSTEM_PROMPT,
    messages: finalResult.messages,
    answer: finalResult.answer,
    tokenUsage: finalResult.tokenUsage,
    generatedSql: finalResult.generatedSql,
  });

  return finalResult;
}
