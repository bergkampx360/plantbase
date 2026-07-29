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
} = vi.hoisted(() => ({
  threadFindManyMock: vi.fn(),
  threadFindUniqueMock: vi.fn(),
  threadCreateMock: vi.fn(),
  threadUpdateMock: vi.fn(),
  messageFindManyMock: vi.fn(),
  messageCreateMock: vi.fn(),
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
  },
}));

import app from './app';

type ResponseMessage = { role: 'assistant'; parts: unknown[] };

// a streamText()-eredmény toUIMessageStream({onFinish}) metódusát mockoljuk (H4) — a
// responseMessage-t itt adja meg a teszt, az onFinish meghívása egy promise-t ad
// vissza, amit a pipeUIMessageStreamToResponseMock (lásd fent) megvár, mielőtt
// lezárja a választ, így a mentés determinisztikusan a válasz előtt fut le
function streamResult(responseMessage: ResponseMessage) {
  return {
    toUIMessageStream: vi.fn(
      (options: {
        onFinish: (opts: { responseMessage: ResponseMessage }) => Promise<void>;
      }) => Promise.resolve(options.onFinish({ responseMessage })),
    ),
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
});

describe('GET /api/threads', () => {
  it('returns the thread list ordered by updatedAt desc', async () => {
    threadFindManyMock.mockResolvedValue([
      { id: 'a', createdAt: '2026-01-01', updatedAt: '2026-01-02' },
    ]);

    const response = await request(app).get('/api/threads');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: 'a', createdAt: '2026-01-01', updatedAt: '2026-01-02' },
    ]);
    expect(threadFindManyMock).toHaveBeenCalledWith({
      orderBy: { updatedAt: 'desc' },
    });
  });
});

describe('GET /api/threads/:id', () => {
  it('returns the thread with its messages when found', async () => {
    threadFindUniqueMock.mockResolvedValue({
      id: 'a',
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
});
