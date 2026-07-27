import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// az ai-mock ugyanaz a minta, mint packages/core/src/ask-agent.spec.ts — kiegészítve
// convertToModelMessages-szel (identitás-mock, mert app.ts ezt is importálja 'ai'-ból)
const { streamTextMock, toolMock, stepCountIsMock, convertToModelMessagesMock, anthropicMock } =
  vi.hoisted(() => ({
    streamTextMock: vi.fn(),
    toolMock: vi.fn((config: unknown) => config),
    stepCountIsMock: vi.fn((count: number) => ({ type: 'stepCountIs', count })),
    convertToModelMessagesMock: vi.fn((messages: unknown) => messages),
    anthropicMock: vi.fn().mockReturnValue('mock-anthropic-model'),
  }));

vi.mock('ai', () => ({
  streamText: streamTextMock,
  tool: toolMock,
  stepCountIs: stepCountIsMock,
  convertToModelMessages: convertToModelMessagesMock,
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

function streamResult(text: string) {
  return {
    pipeUIMessageStreamToResponse: vi.fn(async (res: { end: (chunk: string) => void }) => {
      const onFinish = streamTextMock.mock.calls.at(-1)?.[0]?.onFinish as
        | ((result: { text: string }) => Promise<void>)
        | undefined;
      await onFinish?.({ text });
      res.end('mock-stream');
    }),
  };
}

beforeEach(() => {
  streamTextMock.mockReset();
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
    streamTextMock.mockReturnValue(streamResult('szia!'));

    const response = await request(app)
      .post('/api/chat')
      .send({ id: 'new-thread', message: userMessage });

    expect(response.status).toBe(200);
    expect(threadCreateMock).toHaveBeenCalledWith({ data: { id: 'new-thread' } });
    expect(messageFindManyMock).not.toHaveBeenCalled();
    expect(messageCreateMock).toHaveBeenCalledWith({
      data: { threadId: 'new-thread', role: 'user', content: 'milyen kaktuszotok van?' },
    });
    // az onFinish-ben mentett asszisztens-válasz
    expect(messageCreateMock).toHaveBeenCalledWith({
      data: { threadId: 'new-thread', role: 'assistant', content: 'szia!' },
    });
    expect(threadUpdateMock).toHaveBeenCalledWith({
      where: { id: 'new-thread' },
      data: { updatedAt: expect.any(Date) },
    });
  });

  it('loads prior messages when continuing an existing thread', async () => {
    threadFindUniqueMock.mockResolvedValue({ id: 'existing-thread' });
    messageFindManyMock.mockResolvedValue([
      { id: 1, threadId: 'existing-thread', role: 'user', content: 'korábbi kérdés' },
    ]);
    streamTextMock.mockReturnValue(streamResult('folytatás'));

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
          expect.objectContaining({ role: 'user', parts: [{ type: 'text', text: 'korábbi kérdés' }] }),
          userMessage,
        ]),
      }),
    );
  });
});
