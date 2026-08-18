import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | undefined;
let writePool: pg.Pool | undefined;
let handoffPool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  pool ??= new Pool({ connectionString: process.env['DATABASE_URL_READONLY'] });
  return pool;
}

/**
 * Read-write pool for the knowledge-base ingest (docs/architektura.md döntés #2) — csak
 * insertChunks/clearKnowledge használja, sosem az agent útján fut.
 */
export function getWritePool(): pg.Pool {
  writePool ??= new Pool({ connectionString: process.env['DATABASE_URL'] });
  return writePool;
}

/**
 * Insert-only pool a requestHumanHandoff toolhoz (docs/implementation/09-customer-facing-poc.md,
 * J1, 2. döntés) — a plantbase_handoff szerepkör kizárólag INSERT-et kaphat a
 * customer_handoffs táblára, SELECT-et sem lát. Ez az EGYETLEN hely, ahová a customer-facing
 * agent valaha ír.
 */
export function getHandoffPool(): pg.Pool {
  handoffPool ??= new Pool({
    connectionString: process.env['DATABASE_URL_HANDOFF'],
  });
  return handoffPool;
}
