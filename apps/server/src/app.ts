import { anthropic } from '@ai-sdk/anthropic';
import {
  LIST_CATEGORIES_TOOL,
  MAX_TOOL_ITERATIONS,
  REQUEST_HUMAN_HANDOFF_TOOL,
  RUN_SQL_TOOL,
  SEARCH_KNOWLEDGE_TOOL,
  SEARCH_PRODUCTS_TOOL,
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_CUSTOMER,
  generateThreadTitle,
  logInteraction,
  resolveModel,
} from '@plantbase/core';
import { prisma, type InputJsonValue } from '@plantbase/db';
import {
  convertToModelMessages,
  pipeUIMessageStreamToResponse,
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

// origin: 'internal' szűrés (J5, docs/implementation/09-customer-facing-poc.md, 8. döntés) —
// enélkül a /api/customer/chat által létrehozott ügyfél-threadek megkülönböztetés nélkül
// bekerülnének a belső ThreadSidebar listájába. A meglévő belső hívó viselkedése változatlan
// marad (nincs új query-paraméter, amit neki kezelnie kellene).
app.get('/api/threads', async (_req: Request, res: Response) => {
  const threads = await prisma.thread.findMany({
    where: { origin: 'internal' },
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

  // szimmetrikus a lista-szűréssel — egy ügyfél-thread id-jére ugyanaz a 404 fut, mint egy
  // nem létező id-re, nem csak a lista tűnik el a sidebarból (8. döntés)
  if (!thread || thread.origin !== 'internal') {
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
  });

  // toUIMessageStream({ onFinish }) — NEM a streamText()-szintű onFinish — mert a
  // responseMessage egy teljes, kész UIMessage a parts tömbjével (szöveg + minden
  // tool-hívás/-eredmény, ugyanabban az alakban, amit a kliens useChat-je végül
  // megkap), így nincs szükség kézi steps-parsingra a perzisztáláshoz (H4)
  const uiMessageStream = result.toUIMessageStream({
    onFinish: async ({ responseMessage }) => {
      await prisma.message.create({
        data: {
          threadId: id,
          role: 'assistant',
          content: extractText(responseMessage),
          // Prisma Json mező InputJsonValue-t vár, a UIMessagePart uniónak nincs
          // string index signature-je — a JSON round-trip strukturálisan egyszerű,
          // sima objektumra alakítja (mellékesen az undefined mezőket is eldobja)
          parts: JSON.parse(
            JSON.stringify(responseMessage.parts),
          ) as InputJsonValue,
        },
      });
      await prisma.thread.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
    },
  });

  pipeUIMessageStreamToResponse({ response: res, stream: uiMessageStream });
});

// Ügyfél-facing chat végpont (J5, docs/implementation/09-customer-facing-poc.md) — külön
// route, NEM a /api/chat perzóna-paraméterezése, mert a tool-készlet és a system prompt is
// eltér (SYSTEM_PROMPT_CUSTOMER, searchProducts/searchKnowledge/requestHumanHandoff, NEM
// runSql/listCategories). A Thread/Message táblákat újrahasznosítja, de origin: 'customer'-rel
// hozza létre a threadet (8. döntés). Itt kerül be a logInteraction hívás is — a meglévő
// /api/chat sosem hívta (5. döntés), a mérési terv válaszidő/eszkalációs-arány soraihoz
// viszont ez az egyetlen valós adatforrás.
app.post('/api/customer/chat', async (req: Request, res: Response) => {
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

  const existingThread = await prisma.thread.findUnique({ where: { id } });

  const priorMessages = existingThread
    ? await prisma.message.findMany({
        where: { threadId: id },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  if (!existingThread) {
    const title = await generateThreadTitle(questionText);
    await prisma.thread.create({ data: { id, title, origin: 'customer' } });
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

  const startedAt = Date.now();
  const modelMessages = convertToModelMessages(uiMessages);

  const result = streamText({
    model: anthropic(resolveModel()),
    system: SYSTEM_PROMPT_CUSTOMER,
    messages: modelMessages,
    tools: {
      searchProducts: SEARCH_PRODUCTS_TOOL,
      searchKnowledge: SEARCH_KNOWLEDGE_TOOL,
      requestHumanHandoff: REQUEST_HUMAN_HANDOFF_TOOL,
    },
    stopWhen: stepCountIs(MAX_TOOL_ITERATIONS),
  });

  const uiMessageStream = result.toUIMessageStream({
    onFinish: async ({ responseMessage }) => {
      await prisma.message.create({
        data: {
          threadId: id,
          role: 'assistant',
          content: extractText(responseMessage),
          parts: JSON.parse(
            JSON.stringify(responseMessage.parts),
          ) as InputJsonValue,
        },
      });
      await prisma.thread.update({
        where: { id },
        data: { updatedAt: new Date() },
      });

      const [steps, totalUsage, response] = await Promise.all([
        result.steps,
        result.totalUsage,
        result.response,
      ]);

      const escalated = steps
        .flatMap((step) => step.toolCalls)
        .some((toolCall) => toolCall.toolName === 'requestHumanHandoff');

      await logInteraction({
        system: SYSTEM_PROMPT_CUSTOMER,
        messages: [...modelMessages, ...response.messages],
        answer: extractText(responseMessage),
        tokenUsage: {
          inputTokens: totalUsage.inputTokens ?? 0,
          outputTokens: totalUsage.outputTokens ?? 0,
        },
        durationMs: Date.now() - startedAt,
        escalated,
        persona: 'customer',
      });
    },
  });

  pipeUIMessageStreamToResponse({ response: res, stream: uiMessageStream });
});

// Staff jóváhagyási végpontok (J5) — sima Prisma RW olvasás/írás, nincs LLM-hívás. A
// requestHumanHandoff tool csak INSERT-et végez (getHandoffPool(), insert-only szerepkör,
// J1-J2); a jóváhagyás/elutasítás (status UPDATE) mindig itt, emberi művelet nyomán történik,
// sosem az agent útján (2. döntés).
app.get('/api/handoffs', async (req: Request, res: Response) => {
  const status =
    typeof req.query['status'] === 'string' ? req.query['status'] : 'pending';

  const handoffs = await prisma.customerHandoff.findMany({
    where: { status },
    orderBy: { createdAt: 'asc' },
  });
  res.json(handoffs);
});

async function reviewHandoff(
  req: Request,
  res: Response,
  status: 'approved' | 'rejected',
): Promise<void> {
  const id = Number(req.params['id']);

  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Érvénytelen handoff id.' });
    return;
  }

  // req.body undefined marad, ha a kérés body/Content-Type nélkül érkezik (pl. a staff UI
  // "Jóváhagyás" gombja üres törzzsel is hívhatja) — express.json() csak akkor tölti ki
  // {}-vel, ha van (akár üres) JSON body és megfelelő Content-Type
  const { reviewer, reviewNote } = (req.body ?? {}) as {
    reviewer?: unknown;
    reviewNote?: unknown;
  };

  const existing = await prisma.customerHandoff.findUnique({ where: { id } });

  if (!existing) {
    res.status(404).json({ error: 'Nincs ilyen handoff.' });
    return;
  }

  const updated = await prisma.customerHandoff.update({
    where: { id },
    data: {
      status,
      reviewer: typeof reviewer === 'string' ? reviewer : null,
      reviewNote: typeof reviewNote === 'string' ? reviewNote : null,
      reviewedAt: new Date(),
    },
  });

  res.json(updated);
}

app.post('/api/handoffs/:id/approve', (req: Request, res: Response) =>
  reviewHandoff(req, res, 'approved'),
);

app.post('/api/handoffs/:id/reject', (req: Request, res: Response) =>
  reviewHandoff(req, res, 'rejected'),
);

export default app;
