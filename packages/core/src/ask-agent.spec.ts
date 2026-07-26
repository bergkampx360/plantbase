import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelMessage } from 'ai';

const { streamTextMock, toolMock, stepCountIsMock, anthropicMock } = vi.hoisted(
  () => ({
    streamTextMock: vi.fn(),
    toolMock: vi.fn((config: unknown) => config),
    stepCountIsMock: vi.fn((count: number) => ({ type: 'stepCountIs', count })),
    anthropicMock: vi.fn().mockReturnValue('mock-anthropic-model'),
  }),
);

vi.mock('ai', () => ({
  streamText: streamTextMock,
  tool: toolMock,
  stepCountIs: stepCountIsMock,
}));

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: anthropicMock,
}));

vi.mock('./log-interaction', () => ({
  logInteraction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./db-pool', () => ({
  getPool: vi.fn(),
  getWritePool: vi.fn(),
}));

import { askAgent, MAX_TOOL_ITERATIONS } from './ask-agent';
import { logInteraction } from './log-interaction';

const mockedLogInteraction = vi.mocked(logInteraction);

type ToolCall = { toolName: string; input: unknown };
type Step = { toolCalls: ToolCall[] };

function streamResult(options: {
  text: string;
  responseMessages: ModelMessage[];
  steps?: Step[];
  totalUsage?: { inputTokens: number; outputTokens: number };
}) {
  return {
    text: options.text,
    totalUsage: options.totalUsage ?? { inputTokens: 20, outputTokens: 10 },
    response: { messages: options.responseMessages },
    steps: options.steps ?? [],
  };
}

beforeEach(() => {
  streamTextMock.mockReset();
  mockedLogInteraction.mockClear();
});

describe('askAgent', () => {
  it('returns the final answer and aggregated token usage from a single-step run', async () => {
    streamTextMock.mockReturnValue(
      streamResult({
        text: 'Szia! Miben segíthetek?',
        responseMessages: [
          { role: 'assistant', content: 'Szia! Miben segíthetek?' },
        ],
      }),
    );

    const result = await askAgent('szia');

    expect(result.answer).toBe('Szia! Miben segíthetek?');
    expect(result.tokenUsage).toEqual({ inputTokens: 20, outputTokens: 10 });
    expect(result.generatedSql).toBeUndefined();
    expect(result.messages).toEqual([
      { role: 'user', content: 'szia' },
      { role: 'assistant', content: 'Szia! Miben segíthetek?' },
    ]);
  });

  it('passes the three tools and stepCountIs(MAX_TOOL_ITERATIONS) to streamText', async () => {
    streamTextMock.mockReturnValue(
      streamResult({ text: 'válasz', responseMessages: [] }),
    );

    await askAgent('kérdés');

    expect(stepCountIsMock).toHaveBeenCalledWith(MAX_TOOL_ITERATIONS);
    const call = streamTextMock.mock.calls[0][0];
    expect(Object.keys(call.tools)).toEqual([
      'runSql',
      'listCategories',
      'searchKnowledge',
    ]);
    expect(call.stopWhen).toEqual({
      type: 'stepCountIs',
      count: MAX_TOOL_ITERATIONS,
    });
  });

  it('extracts generatedSql from the last runSql tool call across steps', async () => {
    streamTextMock.mockReturnValue(
      streamResult({
        text: 'Van pozsgás növényünk.',
        responseMessages: [],
        steps: [
          { toolCalls: [{ toolName: 'listCategories', input: {} }] },
          {
            toolCalls: [{ toolName: 'runSql', input: { query: 'SELECT 1' } }],
          },
          {
            toolCalls: [
              {
                toolName: 'runSql',
                input: {
                  query: "SELECT * FROM products WHERE category = 'pozsgás'",
                },
              },
            ],
          },
        ],
      }),
    );

    const result = await askAgent('vannak pozsgás növényeitek?');

    expect(result.generatedSql).toBe(
      "SELECT * FROM products WHERE category = 'pozsgás'",
    );
  });

  it('prepends conversation history before the new user message', async () => {
    streamTextMock.mockReturnValue(
      streamResult({
        text: 'második válasz',
        responseMessages: [{ role: 'assistant', content: 'második válasz' }],
      }),
    );

    const history: ModelMessage[] = [
      { role: 'user', content: 'első kérdés' },
      { role: 'assistant', content: 'első válasz' },
    ];

    const result = await askAgent('második kérdés', history);

    const call = streamTextMock.mock.calls[0][0];
    expect(call.messages).toEqual([
      ...history,
      { role: 'user', content: 'második kérdés' },
    ]);
    expect(result.messages).toEqual([
      ...history,
      { role: 'user', content: 'második kérdés' },
      { role: 'assistant', content: 'második válasz' },
    ]);
  });

  it('logs the interaction with the final answer, messages, and token usage', async () => {
    streamTextMock.mockReturnValue(
      streamResult({
        text: 'válasz',
        responseMessages: [{ role: 'assistant', content: 'válasz' }],
        totalUsage: { inputTokens: 5, outputTokens: 3 },
      }),
    );

    await askAgent('kérdés');

    expect(mockedLogInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        answer: 'válasz',
        tokenUsage: { inputTokens: 5, outputTokens: 3 },
      }),
    );
  });

  it('falls back to 0 token usage when the SDK reports undefined counts', async () => {
    streamTextMock.mockReturnValue({
      text: 'válasz',
      totalUsage: { inputTokens: undefined, outputTokens: undefined },
      response: { messages: [] },
      steps: [],
    });

    const result = await askAgent('kérdés');

    expect(result.tokenUsage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  describe('ANTHROPIC_MODEL fallback', () => {
    const originalModel = process.env['ANTHROPIC_MODEL'];

    beforeEach(() => {
      delete process.env['ANTHROPIC_MODEL'];
      anthropicMock.mockClear();
      streamTextMock.mockReturnValue(
        streamResult({ text: 'válasz', responseMessages: [] }),
      );
    });

    afterEach(() => {
      if (originalModel === undefined) {
        delete process.env['ANTHROPIC_MODEL'];
      } else {
        process.env['ANTHROPIC_MODEL'] = originalModel;
      }
    });

    it('falls back to claude-haiku-4-5 when ANTHROPIC_MODEL is unset', async () => {
      await askAgent('kérdés');

      expect(anthropicMock).toHaveBeenCalledWith('claude-haiku-4-5');
    });
  });
});
