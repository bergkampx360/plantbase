// a repo gyökerén lévő .env-et tölti be — a globálisan/CI-ban indított szerver-folyamat
// nem örökli a direnv shell-integrációt, ezért ezt magának kell megtennie induláskor,
// mielőtt bármelyik streamText-hívás lefutna (ua. minta, mint apps/cli/src/main.ts)
import { config as loadEnv } from 'dotenv';
loadEnv();

import { anthropic } from '@ai-sdk/anthropic';
import {
  LIST_CATEGORIES_TOOL,
  MAX_TOOL_ITERATIONS,
  RUN_SQL_TOOL,
  SEARCH_KNOWLEDGE_TOOL,
  SYSTEM_PROMPT,
  resolveModel,
} from '@plantbase/core';
import { prisma } from '@plantbase/db';
import { stepCountIs, streamText } from 'ai';
import cors from 'cors';
import express, { type Request, type Response } from 'express';

const app = express();

app.use(
  cors({ origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173' }),
);
app.use(express.json());

app.get('/api/threads', async (_req: Request, res: Response) => {
  const threads = await prisma.thread.findMany({
    orderBy: { updatedAt: 'desc' },
  });
  res.json(threads);
});

app.get('/api/threads/:id', async (req: Request, res: Response) => {
  const id = Number(req.params['id']);

  if (!Number.isInteger(id)) {
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
  const { question, threadId } = req.body as {
    question?: unknown;
    threadId?: unknown;
  };

  if (typeof question !== 'string' || question.trim() === '') {
    res.status(400).json({ error: 'A "question" mező kötelező.' });
    return;
  }

  // meglévő thread folytatása, vagy új nyitása, ha nincs érvényes threadId — a
  // beszélgetés-történet innentől a Prisma Clienten (RW) megy, nem a runSql/searchKnowledge
  // RO poolján (ez alkalmazás-adat, nem agent-facing tudásbázis-olvasás, ld. schema.prisma
  // Thread-modell fölötti komment)
  const existingThread =
    typeof threadId === 'number'
      ? await prisma.thread.findUnique({ where: { id: threadId } })
      : null;
  const thread = existingThread ?? (await prisma.thread.create({ data: {} }));

  // a korábbi körök betöltése, MIELŐTT az új user-üzenet perzisztálódna — enélkül a
  // streamText-hívás nem látná az előző kör(öke)t, és a threadId-folytonosság csak
  // a mentésben létezne, a modell válaszaiban nem
  const priorMessages = existingThread
    ? await prisma.message.findMany({
        where: { threadId: thread.id },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  await prisma.message.create({
    data: { threadId: thread.id, role: 'user', content: question },
  });

  // a threadId-t egy response header-ben adjuk vissza — a streamelt válasznak nincs más
  // egyszerű csatornája erre ebben a fázisban (nincs még data-tool/data-agent custom part,
  // ld. G2 döntés)
  res.setHeader('X-Thread-Id', String(thread.id));

  // önálló streamText-hívás, NEM az askAgent()-en keresztül (G1 döntés #1) — a CLI és
  // a szerver két külön Node-folyamat, csak a tool/prompt/modell-építőelemeket osztják
  // meg a packages/core exportjain keresztül
  const result = streamText({
    model: anthropic(resolveModel()),
    system: SYSTEM_PROMPT,
    messages: [
      ...priorMessages.map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      })),
      { role: 'user' as const, content: question },
    ],
    tools: {
      runSql: RUN_SQL_TOOL,
      listCategories: LIST_CATEGORIES_TOOL,
      searchKnowledge: SEARCH_KNOWLEDGE_TOOL,
    },
    stopWhen: stepCountIs(MAX_TOOL_ITERATIONS),
    onFinish: async ({ text }) => {
      await prisma.message.create({
        data: { threadId: thread.id, role: 'assistant', content: text },
      });
      await prisma.thread.update({
        where: { id: thread.id },
        data: { updatedAt: new Date() },
      });
    },
  });

  result.pipeUIMessageStreamToResponse(res);
});

const PORT = Number(process.env['PORT'] ?? 3001);

app.listen(PORT, () => {
  console.log(`plantbase server listening on :${PORT}`);
});
