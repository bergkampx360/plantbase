import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  pool ??= new Pool({ connectionString: process.env['DATABASE_URL_READONLY'] });
  return pool;
}
