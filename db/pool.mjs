import pg from 'pg';

let pool;
export function databasePool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!pool) pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  return pool;
}
