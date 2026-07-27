import { anthropic } from '@ai-sdk/anthropic';
import {
  LIST_CATEGORIES_TOOL,
  MAX_TOOL_ITERATIONS,
  RUN_SQL_TOOL,
  SEARCH_KNOWLEDGE_TOOL,
  SYSTEM_PROMPT,
  generateThreadTitle,
  resolveModel,
} from '@plantbase/core';
import { prisma } from '@plantbase/db';
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from 'ai';
import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';

// az Express app felépítése önmagában, app.listen() NÉLKÜL — tesztelhetőség
// (supertest a valós app-példányra megy, nem valós szerverre; G7), a tényleges
// bootstrap (.env betöltés + app.listen) main.ts dolga
export const app: Express = express();

app.use(
  cors({ origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:4200' }),
);
app.use(express.json());

function extractText(message: UIMessage): string {
  return message.parts
    .filter(
      (part): part is Extract<UIMessage['parts'][number], { type: 'text' }> =>
        part.type === 'text',
    )
    .map((part) => part.text)
    .join('');
}

app.get('/api/threads', async (_req: Request, res: Response) => {
  const threads = await prisma.thread.findMany({
    orderBy: { updatedAt: 'desc' },
  });
  res.json(threads);
});

app.get('/api/threads/:id', async (req: Request, res: Response) => {
  const id = req.params['id'];

  if (typeof id !== 'string') {
    res.status(400).json({ error: 'Érvénytelen thread id.' });
    return;
  }

  const thread = await prisma.thread.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });

  if (!thread) {
    res.status(404).json({ error: 'Nincs ilyen thread.' });
    return;
  }

  res.json(thread);
});

app.post('/api/chat', async (req: Request, res: Response) => {
  const { id, message } = req.body as { id?: unknown; message?: UIMessage };

  if (typeof id !== 'string' || id.trim() === '' || message == null) {
    res.status(400).json({ error: 'Az "id" és a "message" mező kötelező.' });
    return;
  }

  const questionText = extractText(message);

  if (questionText.trim() === '') {
    res.status(400).json({ error: 'Üres üzenet nem küldhető.' });
    return;
  }

  // meglévő thread folytatása, vagy új nyitása a kliens által generált id-val
  // (useChat + generateId() az 'ai'-ból) — a szerver sosem talál ki saját
  // azonosítót, csak arra perzisztál, amit kapott (AI SDK natív mintája)
  const existingThread = await prisma.thread.findUnique({ where: { id } });

  // a korábbi körök betöltése, MIELŐTT az új user-üzenet perzisztálódna — enélkül a
  // streamText-hívás nem látná az előző kör(öke)t
  const priorMessages = existingThread
    ? await prisma.message.findMany({
        where: { threadId: id },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  if (!existingThread) {
    // a cím a szerveren, LLM-összefoglalással jön létre (H3) — nem nyers
    // karakter-csonkolással, ami félbevágott mondatokat adhatna
    const title = await generateThreadTitle(questionText);
    await prisma.thread.create({ data: { id, title } });
  }

  await prisma.message.create({
    data: { threadId: id, role: 'user', content: questionText },
  });

  const uiMessages: UIMessage[] = [
    ...priorMessages.map((m): UIMessage => ({
      id: String(m.id),
      role: m.role as 'user' | 'assistant',
      parts: [{ type: 'text', text: m.content }],
    })),
    message,
  ];

  // önálló streamText-hívás, NEM az askAgent()-en keresztül (G1 döntés #1) — a CLI és
  // a szerver két külön Node-folyamat, csak a tool/prompt/modell-építőelemeket osztják
  // meg a packages/core exportjain keresztül
  const result = streamText({
    model: anthropic(resolveModel()),
    system: SYSTEM_PROMPT,
    messages: convertToModelMessages(uiMessages),
    tools: {
      runSql: RUN_SQL_TOOL,
      listCategories: LIST_CATEGORIES_TOOL,
      searchKnowledge: SEARCH_KNOWLEDGE_TOOL,
    },
    stopWhen: stepCountIs(MAX_TOOL_ITERATIONS),
    onFinish: async ({ text }) => {
      await prisma.message.create({
        data: { threadId: id, role: 'assistant', content: text },
      });
      await prisma.thread.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
    },
  });

  result.pipeUIMessageStreamToResponse(res);
});

export default app;
