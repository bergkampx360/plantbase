import { config as loadEnv } from 'dotenv';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

loadEnv({ path: resolve(__dirname, '../../../../.env') });

import { chunkArticle } from './chunk';
import { embedTexts } from './embed';
import { clearKnowledge, insertChunks, toStoredChunks } from './knowledge-store';

const KNOWLEDGE_DIR = resolve(__dirname, '../../../db/prisma/seed/knowledge');

async function main(): Promise<void> {
  const filenames = readdirSync(KNOWLEDGE_DIR).filter((f) => f.endsWith('.md'));
  console.log(`${filenames.length} cikk beolvasása: ${KNOWLEDGE_DIR}`);

  await clearKnowledge();

  let totalChunks = 0;
  for (const filename of filenames) {
    const fileContent = readFileSync(join(KNOWLEDGE_DIR, filename), 'utf-8');
    const article = chunkArticle(fileContent, filename);

    const embeddings = await embedTexts(article.chunks.map((c) => c.content));
    const storedChunks = toStoredChunks(
      article.source,
      article.title,
      article.category,
      article.chunks,
      embeddings,
    );

    await insertChunks(storedChunks);
    totalChunks += storedChunks.length;
  }

  console.log(`Kész: ${filenames.length} cikk, ${totalChunks} chunk beírva.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
