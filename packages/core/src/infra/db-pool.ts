import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | undefined;
let writePool: pg.Pool | undefined;

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
