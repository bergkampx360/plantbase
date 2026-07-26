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
import { stepCountIs, streamText } from 'ai';
import cors from 'cors';
import express, { type Request, type Response } from 'express';

const app = express();

app.use(cors({ origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173' }));
app.use(express.json());

app.post('/api/chat', (req: Request, res: Response) => {
  const { question } = req.body as { question?: unknown };

  if (typeof question !== 'string' || question.trim() === '') {
    res.status(400).json({ error: 'A "question" mező kötelező.' });
    return;
  }

  // önálló streamText-hívás, NEM az askAgent()-en keresztül (G1 döntés #1) — a CLI és
  // a szerver két külön Node-folyamat, csak a tool/prompt/modell-építőelemeket osztják
  // meg a packages/core exportjain keresztül
  const result = streamText({
    model: anthropic(resolveModel()),
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: question }],
    tools: {
      runSql: RUN_SQL_TOOL,
      listCategories: LIST_CATEGORIES_TOOL,
      searchKnowledge: SEARCH_KNOWLEDGE_TOOL,
    },
    stopWhen: stepCountIs(MAX_TOOL_ITERATIONS),
  });

  result.pipeUIMessageStreamToResponse(res);
});

const PORT = Number(process.env['PORT'] ?? 3001);

app.listen(PORT, () => {
  console.log(`plantbase server listening on :${PORT}`);
});
