import { config } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig, env } from 'prisma/config';

// A repo gyökerén él a .env (CLAUDE.md: "Application runtime variables belong
// in .env"), NEM packages/db-ben — a prisma CLI-t viszont mindig ebből a
// csomagból futtatjuk (pnpm --filter @plantbase/db), ezért explicit útvonal kell.
config({ path: resolve(import.meta.dirname, '../../.env') });

type Env = {
  DATABASE_URL: string;
};

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/seed.ts',
  },
  datasource: {
    url: env<Env>('DATABASE_URL'),
  },
});
