import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('./search-knowledge', () => ({
  SEARCH_KNOWLEDGE_TOOL: {
    name: 'searchKnowledge',
    description: 'mock',
    input_schema: { type: 'object', properties: {} },
  },
  searchKnowledge: vi.fn(),
}));

import { askAgent } from './ask-agent';
import { getPool } from './db-pool';
import { searchKnowledge } from './search-knowledge';

const mockedGetPool = vi.mocked(getPool);
const mockedSearchKnowledge = vi.mocked(searchKnowledge);
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
  mockedSearchKnowledge.mockReset();
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

  it('calls searchKnowledge for a care question and returns a final answer', async () => {
    const retrievalResult = {
      chunks: [{ title: 'Öntözés', content: 'Hetente egyszer.', score: 9 }],
      hitCount: 1,
      topScore: 9,
    };
    mockedSearchKnowledge.mockResolvedValueOnce(
      JSON.stringify(retrievalResult),
    );
    createMock
      .mockResolvedValueOnce(
        toolUseResponse('searchKnowledge', {
          query: 'mikor öntözzem a monsterát?',
        }),
      )
      .mockResolvedValueOnce(finalAnswerResponse('Hetente egyszer öntözd.'));

    const result = await askAgent('mikor öntözzem a monsterát?');

    expect(result.answer).not.toBe('');
    expect(mockedSearchKnowledge).toHaveBeenCalledWith({
      query: 'mikor öntözzem a monsterát?',
    });
    const toolResultMessage = result.messages[2];
    const block = (
      toolResultMessage.content as Anthropic.ToolResultBlockParam[]
    )[0];
    expect(block.is_error).toBeUndefined();
    expect(block.content).toBe(JSON.stringify(retrievalResult));
  });

  it('continues the loop after a searchKnowledge error and returns a final answer', async () => {
    mockedSearchKnowledge.mockRejectedValueOnce(
      new Error('embedding hívás sikertelen'),
    );
    createMock
      .mockResolvedValueOnce(
        toolUseResponse('searchKnowledge', { query: 'sárgul a levél' }),
      )
      .mockResolvedValueOnce(finalAnswerResponse('Nem sikerült a keresés.'));

    const result = await askAgent('miért sárgul a levelem?');

    expect(result.answer).not.toBe('');
    const toolResultMessage = result.messages[2];
    const block = (
      toolResultMessage.content as Anthropic.ToolResultBlockParam[]
    )[0];
    expect(block.is_error).toBe(true);
    expect(block.content).toBe('embedding hívás sikertelen');
  });

  it('supports a self-reflective retry: a weak first search is followed by a reformulated query', async () => {
    const weakResult = { chunks: [], hitCount: 0, topScore: 0 };
    const strongResult = {
      chunks: [
        { title: 'Sárguló levelek', content: 'Túlöntözés jele.', score: 8 },
      ],
      hitCount: 1,
      topScore: 8,
    };
    mockedSearchKnowledge
      .mockResolvedValueOnce(JSON.stringify(weakResult))
      .mockResolvedValueOnce(JSON.stringify(strongResult));

    createMock
      .mockResolvedValueOnce(
        toolUseResponse('searchKnowledge', { query: 'sárgul a levél' }),
      )
      .mockResolvedValueOnce(
        toolUseResponse('searchKnowledge', {
          query: 'sárguló levelek túlöntözés',
        }),
      )
      .mockResolvedValueOnce(finalAnswerResponse('Valószínűleg túlöntözted.'));

    const result = await askAgent('miért sárgul a levelem?');

    expect(result.answer).not.toBe('');
    expect(mockedSearchKnowledge).toHaveBeenCalledTimes(2);
    expect(mockedSearchKnowledge).toHaveBeenNthCalledWith(1, {
      query: 'sárgul a levél',
    });
    expect(mockedSearchKnowledge).toHaveBeenNthCalledWith(2, {
      query: 'sárguló levelek túlöntözés',
    });
    expect(result.messages.length).toBeGreaterThanOrEqual(6);
  });

  it('turns an unknown tool name into an error tool_result instead of throwing', async () => {
    createMock
      .mockResolvedValueOnce(toolUseResponse('deleteEverything', {}))
      .mockResolvedValueOnce(
        finalAnswerResponse('Nem tudom ezt a műveletet elvégezni.'),
      );

    const result = await askAgent('töröld az összes adatot');

    expect(result.answer).not.toBe('');
    const toolResultMessage = result.messages[2];
    const block = (
      toolResultMessage.content as Anthropic.ToolResultBlockParam[]
    )[0];
    expect(block.is_error).toBe(true);
    expect(block.content).toBe('Ismeretlen tool: deleteEverything');
  });

  describe('ANTHROPIC_MODEL fallback', () => {
    const originalModel = process.env['ANTHROPIC_MODEL'];

    beforeEach(() => {
      delete process.env['ANTHROPIC_MODEL'];
    });

    afterEach(() => {
      if (originalModel === undefined) {
        delete process.env['ANTHROPIC_MODEL'];
      } else {
        process.env['ANTHROPIC_MODEL'] = originalModel;
      }
    });

    it('falls back to claude-haiku-4-5 when ANTHROPIC_MODEL is unset', async () => {
      createMock.mockResolvedValueOnce(finalAnswerResponse('válasz'));

      await askAgent('kérdés');

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-haiku-4-5' }),
      );
    });
  });
});
