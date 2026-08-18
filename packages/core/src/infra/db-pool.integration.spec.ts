import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// Valódi, futó Postgres ellen fut (docs/testing-strategy.md "Integration" szintje) — NEM
// az alap `test` target része (vitest.config.mts exclude-ja zárja ki), külön
// `pnpm --filter @plantbase/core run test:integration` scripttel fut, mert docker-compose
// Postgrest és a db-role-setup skill lefuttatását igényli (plantbase_handoff, plantbase_ro
// szerepkörök).
loadEnv({ path: resolve(__dirname, '../../../../.env') });

const dbAvailable = Boolean(
  process.env['DATABASE_URL_HANDOFF'] && process.env['DATABASE_URL_READONLY'],
);

describe.skipIf(!dbAvailable)(
  'db-pool integráció — customer_handoffs jogosultságok (J1, docs/implementation/09-customer-facing-poc.md)',
  () => {
    afterAll(async () => {
      const { getHandoffPool, getWritePool } = await import('./db-pool');
      await getWritePool().query(
        "DELETE FROM customer_handoffs WHERE question = 'integrációs teszt kérdés'",
      );
      await getHandoffPool().end();
      await getWritePool().end();
    });

    it('plantbase_handoff INSERT-elhet a customer_handoffs táblába', async () => {
      const { getHandoffPool } = await import('./db-pool');
      await expect(
        getHandoffPool().query(
          'INSERT INTO customer_handoffs (question, reason) VALUES ($1, $2)',
          ['integrációs teszt kérdés', 'weak_knowledge'],
        ),
      ).resolves.toBeDefined();
    });

    it('plantbase_handoff NEM tudja visszaolvasni a customer_handoffs táblát', async () => {
      const { getHandoffPool } = await import('./db-pool');
      await expect(
        getHandoffPool().query('SELECT * FROM customer_handoffs'),
      ).rejects.toThrow(/permission denied/i);
    });

    it('plantbase_ro (a belső runSql/searchKnowledge szerepköre) NEM lát SELECT-tel a customer_handoffs táblára', async () => {
      const { getPool } = await import('./db-pool');
      await expect(
        getPool().query('SELECT * FROM customer_handoffs'),
      ).rejects.toThrow(/permission denied/i);
    });
  },
);
