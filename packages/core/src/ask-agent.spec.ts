import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

const createMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function (this: {
    messages: { create: typeof createMock };
  }) {
    this.messages = { create: createMock };
  }),
}));

vi.mock('./log-interaction', () => ({
  logInteraction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./db-pool', () => ({
  getPool: vi.fn(),
}));

import { askAgent } from './ask-agent';
import { getPool } from './db-pool';

const mockedGetPool = vi.mocked(getPool);
const queryMock = vi.fn();

function usage(inputTokens = 10, outputTokens = 5) {
  return { input_tokens: inputTokens, output_tokens: outputTokens };
}

function toolUseResponse(
  name: string,
  input: Record<string, unknown>,
): Anthropic.Message {
  return {
    stop_reason: 'tool_use',
    usage: usage(),
    content: [{ type: 'tool_use', id: `tool_${name}`, name, input }],
  } as unknown as Anthropic.Message;
}

function finalAnswerResponse(text: string): Anthropic.Message {
  return {
    stop_reason: 'end_turn',
    usage: usage(),
    content: [{ type: 'text', text }],
  } as unknown as Anthropic.Message;
}

beforeEach(() => {
  createMock.mockReset();
  queryMock.mockReset();
  mockedGetPool.mockReturnValue({
    query: queryMock,
  } as unknown as ReturnType<typeof getPool>);
});

describe('askAgent', () => {
  it('continues the loop after a tool error and returns a final answer', async () => {
    createMock
      .mockResolvedValueOnce(
        toolUseResponse('runSql', { query: 'DROP TABLE products' }),
      )
      .mockResolvedValueOnce(
        finalAnswerResponse('Nem tudom végrehajtani ezt a lekérdezést.'),
      );

    const result = await askAgent('töröld a katalógust');

    expect(result.answer).not.toBe('');
    expect(result.messages.length).toBeGreaterThanOrEqual(4);
    expect(result.tokenUsage.inputTokens).toBeGreaterThan(0);
    expect(result.tokenUsage.outputTokens).toBeGreaterThan(0);
    expect(queryMock).not.toHaveBeenCalled();

    const toolResultMessage = result.messages[2];
    const block = (
      toolResultMessage.content as Anthropic.ToolResultBlockParam[]
    )[0];
    expect(block.is_error).toBe(true);
    expect(block.content).toBe('Csak SELECT lekérdezés engedélyezett.');
  });

  it('continues the loop after a successful tool call and returns a final answer', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Monstera' }],
    });
    createMock
      .mockResolvedValueOnce(
        toolUseResponse('runSql', { query: 'SELECT * FROM products' }),
      )
      .mockResolvedValueOnce(finalAnswerResponse('Egy Monsterát találtam.'));

    const result = await askAgent('milyen növényeitek vannak?');

    expect(result.answer).not.toBe('');
    expect(result.messages.length).toBeGreaterThanOrEqual(4);
    expect(result.tokenUsage.inputTokens).toBeGreaterThan(0);
    expect(result.tokenUsage.outputTokens).toBeGreaterThan(0);

    const toolResultMessage = result.messages[2];
    const block = (
      toolResultMessage.content as Anthropic.ToolResultBlockParam[]
    )[0];
    expect(block.is_error).toBeUndefined();
    expect(block.content).toBe(JSON.stringify([{ id: 1, name: 'Monstera' }]));
  });

  it('runs a multi-tool iteration (listCategories, then runSql, then the final answer)', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ category: 'pozsgás' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Aloe vera' }] });
    createMock
      .mockResolvedValueOnce(toolUseResponse('listCategories', {}))
      .mockResolvedValueOnce(
        toolUseResponse('runSql', {
          query: "SELECT * FROM products WHERE category = 'pozsgás'",
        }),
      )
      .mockResolvedValueOnce(finalAnswerResponse('Van pozsgás növényünk.'));

    const result = await askAgent('vannak pozsgás növényeitek?');

    expect(result.answer).not.toBe('');
    expect(result.messages.length).toBeGreaterThanOrEqual(6);
    expect(queryMock).toHaveBeenCalledTimes(2);
  });
});
