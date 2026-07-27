// a repo gyökerén lévő .env-et tölti be — a globálisan/CI-ban indított szerver-folyamat
// nem örökli a direnv shell-integrációt, ezért ezt magának kell megtennie induláskor,
// mielőtt bármelyik streamText-hívás lefutna (ua. minta, mint apps/cli/src/main.ts)
import { config as loadEnv } from 'dotenv';
loadEnv();

import app from './app';

const PORT = Number(process.env['PORT'] ?? 3001);

app.listen(PORT, () => {
  console.log(`plantbase server listening on :${PORT}`);
});
