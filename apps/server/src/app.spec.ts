import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// az ai-mock ugyanaz a minta, mint packages/core/src/agent/ask-agent.spec.ts — kiegészítve
// convertToModelMessages-szel (identitás-mock, mert app.ts ezt is importálja 'ai'-ból) és
// generateText-tel (a generateThreadTitle, H3, ezt hívja a title-agent.ts-en keresztül)
const {
  streamTextMock,
  toolMock,
  stepCountIsMock,
  convertToModelMessagesMock,
  generateTextMock,
  anthropicMock,
  pipeUIMessageStreamToResponseMock,
} = vi.hoisted(() => ({
  streamTextMock: vi.fn(),
  toolMock: vi.fn((config: unknown) => config),
  stepCountIsMock: vi.fn((count: number) => ({ type: 'stepCountIs', count })),
  convertToModelMessagesMock: vi.fn((messages: unknown) => messages),
  generateTextMock: vi.fn().mockResolvedValue({ text: 'Kaktusz-ajánlás' }),
  anthropicMock: vi.fn().mockReturnValue('mock-anthropic-model'),
  pipeUIMessageStreamToResponseMock: vi.fn(
    ({ response }: { response: { end: (chunk: string) => void } }) => {
      response.end('mock-stream');
    },
  ),
}));

vi.mock('ai', () => ({
  streamText: streamTextMock,
  tool: toolMock,
  stepCountIs: stepCountIsMock,
  convertToModelMessages: convertToModelMessagesMock,
  generateText: generateTextMock,
  pipeUIMessageStreamToResponse: pipeUIMessageStreamToResponseMock,
}));

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: anthropicMock,
}));

// nincs meglévő Prisma-mock minta a repóban (a db-pool mock egy másik, nyers pg.Pool
// modult takar) — ez az első, ide bevezetve, ugyanabban a hoisted+vi.mock stílusban
const {
  threadFindManyMock,
  threadFindUniqueMock,
  threadCreateMock,
  threadUpdateMock,
  messageFindManyMock,
  messageCreateMock,
  handoffFindManyMock,
  handoffFindUniqueMock,
  handoffUpdateMock,
} = vi.hoisted(() => ({
  threadFindManyMock: vi.fn(),
  threadFindUniqueMock: vi.fn(),
  threadCreateMock: vi.fn(),
  threadUpdateMock: vi.fn(),
  messageFindManyMock: vi.fn(),
  messageCreateMock: vi.fn(),
  handoffFindManyMock: vi.fn(),
  handoffFindUniqueMock: vi.fn(),
  handoffUpdateMock: vi.fn(),
}));

vi.mock('@plantbase/db', () => ({
  prisma: {
    thread: {
      findMany: threadFindManyMock,
      findUnique: threadFindUniqueMock,
      create: threadCreateMock,
      update: threadUpdateMock,
    },
    message: {
      findMany: messageFindManyMock,
      create: messageCreateMock,
    },
    customerHandoff: {
      findMany: handoffFindManyMock,
      findUnique: handoffFindUniqueMock,
      update: handoffUpdateMock,
    },
  },
}));

// logInteraction valódi fájlrendszer-hívást végezne (mkdir/appendFile a logs/ alá) — ez itt
// az egyetlen dolog, amit a '@plantbase/core'-ból mockolni kell, minden más export (tool-ok,
// system promptok) valós marad, mert azokat a mocked 'ai' `tool()` már ártalmatlanná teszi
const { logInteractionMock } = vi.hoisted(() => ({
  logInteractionMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@plantbase/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@plantbase/core')>();
  return { ...actual, logInteraction: logInteractionMock };
});

import app from './app';

type ResponseMessage = { role: 'assistant'; parts: unknown[] };

// a streamText()-eredmény toUIMessageStream({onFinish}) metódusát mockoljuk (H4) — a
// responseMessage-t itt adja meg a teszt, az onFinish meghívása egy promise-t ad
// vissza, amit a pipeUIMessageStreamToResponseMock (lásd fent) megvár, mielőtt
// lezárja a választ, így a mentés determinisztikusan a válasz előtt fut le
type ToolCall = { toolName: string; input: unknown };
type Step = { toolCalls: ToolCall[] };

// steps/totalUsage/response csak a /api/customer/chat útvonalnak kell (logInteraction
// hívásához, J5) — a meglévő /api/chat sosem olvassa ezeket, ezért az alapértékek
// (üres steps, 0 token, üres response.messages) az ottani teszteket nem érintik
function streamResult(
  responseMessage: ResponseMessage,
  options?: {
    steps?: Step[];
    totalUsage?: { inputTokens: number; outputTokens: number };
  },
) {
  return {
    toUIMessageStream: vi.fn(
      (streamOptions: {
        onFinish: (opts: { responseMessage: ResponseMessage }) => Promise<void>;
      }) => Promise.resolve(streamOptions.onFinish({ responseMessage })),
    ),
    steps: options?.steps ?? [],
    totalUsage: options?.totalUsage ?? { inputTokens: 20, outputTokens: 10 },
    response: { messages: [responseMessage] },
  };
}

beforeEach(() => {
  streamTextMock.mockReset();
  pipeUIMessageStreamToResponseMock.mockClear();
  threadFindManyMock.mockReset();
  threadFindUniqueMock.mockReset();
  threadCreateMock.mockReset();
  threadUpdateMock.mockReset();
  messageFindManyMock.mockReset();
  messageCreateMock.mockReset();
  handoffFindManyMock.mockReset();
  handoffFindUniqueMock.mockReset();
  handoffUpdateMock.mockReset();
  logInteractionMock.mockClear();
});

describe('GET /api/threads', () => {
  it('returns the thread list ordered by updatedAt desc, scoped to internal-origin threads', async () => {
    threadFindManyMock.mockResolvedValue([
      { id: 'a', createdAt: '2026-01-01', updatedAt: '2026-01-02' },
    ]);

    const response = await request(app).get('/api/threads');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: 'a', createdAt: '2026-01-01', updatedAt: '2026-01-02' },
    ]);
    expect(threadFindManyMock).toHaveBeenCalledWith({
      where: { origin: 'internal' },
      orderBy: { updatedAt: 'desc' },
    });
  });
});

describe('GET /api/threads/:id', () => {
  it('returns the thread with its messages when found and internal-origin', async () => {
    threadFindUniqueMock.mockResolvedValue({
      id: 'a',
      origin: 'internal',
      messages: [{ id: 1, role: 'user', content: 'szia' }],
    });

    const response = await request(app).get('/api/threads/a');

    expect(response.status).toBe(200);
    expect(response.body.messages).toHaveLength(1);
  });

  it('returns 404 when the thread does not exist', async () => {
    threadFindUniqueMock.mockResolvedValue(null);

    const response = await request(app).get('/api/threads/missing');

    expect(response.status).toBe(404);
  });

  it('returns 404 for a customer-origin thread — same as a nonexistent id, not just hidden from the list', async () => {
    threadFindUniqueMock.mockResolvedValue({
      id: 'customer-thread',
      origin: 'customer',
      messages: [],
    });

    const response = await request(app).get('/api/threads/customer-thread');

    expect(response.status).toBe(404);
  });
});

describe('POST /api/chat', () => {
  const userMessage = {
    id: 'msg-1',
    role: 'user' as const,
    parts: [{ type: 'text' as const, text: 'milyen kaktuszotok van?' }],
  };

  it('returns 400 when id is missing', async () => {
    const response = await request(app)
      .post('/api/chat')
      .send({ message: userMessage });

    expect(response.status).toBe(400);
  });

  it('returns 400 when the message has no text content', async () => {
    const response = await request(app)
      .post('/api/chat')
      .send({ id: 'thread-1', message: { id: 'm', role: 'user', parts: [] } });

    expect(response.status).toBe(400);
  });

  it('creates a new thread when the id is not yet known', async () => {
    threadFindUniqueMock.mockResolvedValue(null);
    const assistantParts = [
      { type: 'text', text: 'szia!' },
      {
        type: 'tool-listCategories',
        toolCallId: 'call-1',
        state: 'output-available',
        input: {},
        output: ['kaktusz'],
      },
    ];
    streamTextMock.mockReturnValue(
      streamResult({ role: 'assistant', parts: assistantParts }),
    );

    const response = await request(app)
      .post('/api/chat')
      .send({ id: 'new-thread', message: userMessage });

    expect(response.status).toBe(200);
    expect(threadCreateMock).toHaveBeenCalledWith({
      data: { id: 'new-thread', title: 'Kaktusz-ajánlás' },
    });
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('milyen kaktuszotok van?'),
      }),
    );
    expect(messageFindManyMock).not.toHaveBeenCalled();
    expect(messageCreateMock).toHaveBeenCalledWith({
      data: {
        threadId: 'new-thread',
        role: 'user',
        content: 'milyen kaktuszotok van?',
      },
    });
    // az onFinish-ben mentett asszisztens-válasz: content a szöveges fallback,
    // parts a teljes tool-hívást is tartalmazó tömb (H4)
    expect(messageCreateMock).toHaveBeenCalledWith({
      data: {
        threadId: 'new-thread',
        role: 'assistant',
        content: 'szia!',
        parts: assistantParts,
      },
    });
    expect(threadUpdateMock).toHaveBeenCalledWith({
      where: { id: 'new-thread' },
      data: { updatedAt: expect.any(Date) },
    });
  });

  it('loads prior messages when continuing an existing thread', async () => {
    threadFindUniqueMock.mockResolvedValue({ id: 'existing-thread' });
    messageFindManyMock.mockResolvedValue([
      {
        id: 1,
        threadId: 'existing-thread',
        role: 'user',
        content: 'korábbi kérdés',
      },
    ]);
    streamTextMock.mockReturnValue(
      streamResult({
        role: 'assistant',
        parts: [{ type: 'text', text: 'folytatás' }],
      }),
    );

    const response = await request(app)
      .post('/api/chat')
      .send({ id: 'existing-thread', message: userMessage });

    expect(response.status).toBe(200);
    expect(threadCreateMock).not.toHaveBeenCalled();
    expect(messageFindManyMock).toHaveBeenCalledWith({
      where: { threadId: 'existing-thread' },
      orderBy: { createdAt: 'asc' },
    });
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            parts: [{ type: 'text', text: 'korábbi kérdés' }],
          }),
          userMessage,
        ]),
      }),
    );
  });

  it('reconstructs a prior assistant message from its stored parts (with a real tool call), not just its flattened content — regression test for a live bug where the model stopped calling tools by turn 2-3 because it only ever saw its own past answers as plain text', async () => {
    threadFindUniqueMock.mockResolvedValue({ id: 'existing-thread' });
    const priorAssistantParts = [
      {
        type: 'tool-searchKnowledge',
        toolCallId: 'call-1',
        state: 'output-available',
        input: { query: 'sárguló levél' },
        output: '{"weak":false}',
      },
      { type: 'text', text: 'korábbi válasz forrással' },
    ];
    messageFindManyMock.mockResolvedValue([
      {
        id: 1,
        threadId: 'existing-thread',
        role: 'assistant',
        content: 'korábbi válasz forrással',
        parts: priorAssistantParts,
      },
    ]);
    streamTextMock.mockReturnValue(
      streamResult({
        role: 'assistant',
        parts: [{ type: 'text', text: 'folytatás' }],
      }),
    );

    await request(app)
      .post('/api/chat')
      .send({ id: 'existing-thread', message: userMessage });

    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'assistant',
            parts: priorAssistantParts,
          }),
        ]),
      }),
    );
  });

  it('falls back to content-only text for a pre-H4 prior message with no stored parts', async () => {
    threadFindUniqueMock.mockResolvedValue({ id: 'existing-thread' });
    messageFindManyMock.mockResolvedValue([
      {
        id: 1,
        threadId: 'existing-thread',
        role: 'assistant',
        content: 'régi, parts nélküli válasz',
        parts: null,
      },
    ]);
    streamTextMock.mockReturnValue(
      streamResult({ role: 'assistant', parts: [{ type: 'text', text: 'x' }] }),
    );

    await request(app)
      .post('/api/chat')
      .send({ id: 'existing-thread', message: userMessage });

    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'assistant',
            parts: [{ type: 'text', text: 'régi, parts nélküli válasz' }],
          }),
        ]),
      }),
    );
  });
});

describe('POST /api/customer/chat', () => {
  const userMessage = {
    id: 'msg-1',
    role: 'user' as const,
    parts: [{ type: 'text' as const, text: 'van akciós pozsgásuk?' }],
  };

  it('returns 400 when id is missing', async () => {
    const response = await request(app)
      .post('/api/customer/chat')
      .send({ message: userMessage });

    expect(response.status).toBe(400);
  });

  it('returns 400 when the message has no text content', async () => {
    const response = await request(app)
      .post('/api/customer/chat')
      .send({ id: 'thread-1', message: { id: 'm', role: 'user', parts: [] } });

    expect(response.status).toBe(400);
  });

  it('creates a new thread with origin "customer", using SYSTEM_PROMPT_CUSTOMER and the three customer-safe tools', async () => {
    threadFindUniqueMock.mockResolvedValue(null);
    streamTextMock.mockReturnValue(
      streamResult({
        role: 'assistant',
        parts: [{ type: 'text', text: 'Igen, van!' }],
      }),
    );

    const response = await request(app)
      .post('/api/customer/chat')
      .send({ id: 'customer-thread', message: userMessage });

    expect(response.status).toBe(200);
    expect(threadCreateMock).toHaveBeenCalledWith({
      data: {
        id: 'customer-thread',
        title: 'Kaktusz-ajánlás',
        origin: 'customer',
      },
    });

    const call = streamTextMock.mock.calls[0][0];
    expect(Object.keys(call.tools)).toEqual([
      'searchProducts',
      'searchKnowledge',
      'requestHumanHandoff',
    ]);
  });

  it('logs the interaction with escalated: false and persona: "customer" when requestHumanHandoff was not called', async () => {
    threadFindUniqueMock.mockResolvedValue({ id: 'customer-thread' });
    messageFindManyMock.mockResolvedValue([]);
    streamTextMock.mockReturnValue(
      streamResult(
        { role: 'assistant', parts: [{ type: 'text', text: 'válasz' }] },
        { steps: [{ toolCalls: [{ toolName: 'searchProducts', input: {} }] }] },
      ),
    );

    await request(app)
      .post('/api/customer/chat')
      .send({ id: 'customer-thread', message: userMessage });

    expect(logInteractionMock).toHaveBeenCalledWith(
      expect.objectContaining({ escalated: false, persona: 'customer' }),
    );
  });

  it('logs escalated: true when requestHumanHandoff was called among the steps', async () => {
    threadFindUniqueMock.mockResolvedValue({ id: 'customer-thread' });
    messageFindManyMock.mockResolvedValue([]);
    streamTextMock.mockReturnValue(
      streamResult(
        {
          role: 'assistant',
          parts: [{ type: 'text', text: 'Kollégának továbbítottam.' }],
        },
        {
          steps: [
            { toolCalls: [{ toolName: 'searchKnowledge', input: {} }] },
            {
              toolCalls: [
                {
                  toolName: 'requestHumanHandoff',
                  input: { reason: 'out_of_scope' },
                },
              ],
            },
          ],
        },
      ),
    );

    await request(app)
      .post('/api/customer/chat')
      .send({ id: 'customer-thread', message: userMessage });

    expect(logInteractionMock).toHaveBeenCalledWith(
      expect.objectContaining({ escalated: true, persona: 'customer' }),
    );
  });
});

describe('GET /api/handoffs', () => {
  it('defaults to status: pending when no query param is given', async () => {
    handoffFindManyMock.mockResolvedValue([{ id: 1, status: 'pending' }]);

    const response = await request(app).get('/api/handoffs');

    expect(response.status).toBe(200);
    expect(handoffFindManyMock).toHaveBeenCalledWith({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('honors an explicit status query param', async () => {
    handoffFindManyMock.mockResolvedValue([]);

    await request(app).get('/api/handoffs?status=approved');

    expect(handoffFindManyMock).toHaveBeenCalledWith({
      where: { status: 'approved' },
      orderBy: { createdAt: 'asc' },
    });
  });
});

describe('POST /api/handoffs/:id/approve and /reject', () => {
  it('returns 400 for a non-numeric id', async () => {
    const response = await request(app).post(
      '/api/handoffs/not-a-number/approve',
    );

    expect(response.status).toBe(400);
    expect(handoffFindUniqueMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the handoff does not exist', async () => {
    handoffFindUniqueMock.mockResolvedValue(null);

    const response = await request(app).post('/api/handoffs/999/approve');

    expect(response.status).toBe(404);
    expect(handoffUpdateMock).not.toHaveBeenCalled();
  });

  it('approves a pending handoff and stamps reviewer/reviewedAt', async () => {
    handoffFindUniqueMock.mockResolvedValue({ id: 1, status: 'pending' });
    handoffUpdateMock.mockResolvedValue({ id: 1, status: 'approved' });

    const response = await request(app)
      .post('/api/handoffs/1/approve')
      .send({ reviewer: 'anna@plantbase.hu' });

    expect(response.status).toBe(200);
    expect(handoffUpdateMock).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        status: 'approved',
        reviewer: 'anna@plantbase.hu',
        reviewNote: null,
        reviewedAt: expect.any(Date),
      },
    });
  });

  it('rejects a pending handoff with a review note', async () => {
    handoffFindUniqueMock.mockResolvedValue({ id: 2, status: 'pending' });
    handoffUpdateMock.mockResolvedValue({ id: 2, status: 'rejected' });

    const response = await request(app)
      .post('/api/handoffs/2/reject')
      .send({ reviewNote: 'duplikált kérés' });

    expect(response.status).toBe(200);
    expect(handoffUpdateMock).toHaveBeenCalledWith({
      where: { id: 2 },
      data: {
        status: 'rejected',
        reviewer: null,
        reviewNote: 'duplikált kérés',
        reviewedAt: expect.any(Date),
      },
    });
  });
});
