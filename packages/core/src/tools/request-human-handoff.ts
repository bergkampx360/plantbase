import { tool } from 'ai';
import { z } from 'zod';
import { getHandoffPool } from '../infra/db-pool';

const RequestHumanHandoffInput = z.object({
  question: z
    .string()
    .min(1)
    .describe('Az ügyfél eredeti kérdése, változatlanul.'),
  reason: z
    .enum(['weak_knowledge', 'out_of_scope', 'complaint_or_judgment'])
    .describe(
      'Miért van szükség emberi felülvizsgálatra: weak_knowledge = a tudásbázis-keresés ' +
        'kétszer is gyenge találatot adott; out_of_scope = a kérés a katalógus/gondozás ' +
        'hatókörén kívül esik (pl. egyedi/nagytételes rendelés); complaint_or_judgment = ' +
        'panasz vagy ítélőképességet igénylő ügy.',
    ),
  context: z
    .string()
    .optional()
    .describe('Rövid beszélgetés-kontextus, ha releváns a döntéshez.'),
  draftReply: z
    .string()
    .optional()
    .describe(
      'Javasolt válasz-piszkozat, HA van — ezt egy ember hagyja jóvá, mielőtt bármi kimegy ' +
        'az ügyfélnek. Ha nincs elég információ egy értelmes vázlathoz, hagyd üresen.',
    ),
});

export const REQUEST_HUMAN_HANDOFF_TOOL = tool({
  description:
    'Emberi felülvizsgálatra küldi az ügyfél kérdését, ha bizonytalan a válasz vagy a kérés ' +
    'a katalógus/gondozás hatókörén kívül esik. Ez az EGYETLEN tool, ami bármit is beír egy ' +
    'adatbázis-táblába — pending státuszú sort hoz létre, amit egy ember hagy jóvá vagy ' +
    'utasít el a staff felületen. Ezután ne generálj végleges választ az ügyfélnek — jelezd, ' +
    'hogy a kérdést kollégának továbbítottad, és ne ígérj konkrét határidőt.',
  inputSchema: RequestHumanHandoffInput,
  execute: async (input) => {
    try {
      return await requestHumanHandoff(input);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  },
});

export async function requestHumanHandoff(input: unknown): Promise<string> {
  const parsed = RequestHumanHandoffInput.parse(input);

  // NINCS `RETURNING id` — bár elsőre kényelmes lenne az id-t visszaadni, a Postgres a
  // RETURNING-ben olvasott oszlopokra SELECT jogot követel meg, ami vagy egy oszlop-szintű
  // kivételt igényelne a plantbase_handoff szerepkörön (docs/implementation/09-customer-facing-poc.md,
  // 2. döntés: "SELECT-et sem lát"), vagy ezt a mondatot tenné hazug állítássá. Kézi
  // ellenőrzéssel derült ki (nem csak feltételezésből): `INSERT ... RETURNING id` ezzel a
  // szerepkörrel ténylegesen `permission denied` hibával bukik. Az agent-nek nincs is
  // szüksége az id-re — a staff felület (/staff/handoffs) a saját, Prisma RW listázásán
  // keresztül látja a pending sorokat, nem az agent válaszából.
  await getHandoffPool().query(
    `INSERT INTO customer_handoffs (question, context, reason, draft_reply)
     VALUES ($1, $2, $3, $4)`,
    [
      parsed.question,
      parsed.context ?? null,
      parsed.reason,
      parsed.draftReply ?? null,
    ],
  );

  return JSON.stringify({ status: 'pending' });
}
