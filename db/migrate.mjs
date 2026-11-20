import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const lockId = 74022002;

export async function migrate(connectionString, { through, schema } = {}) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  if (schema && !/^pubx_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Invalid test schema');
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [lockId]);
    if (schema) await client.query(`SET search_path TO "${schema}"`);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const files = (await readdir(migrationsDir)).filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
    const applied = new Map((await client.query('SELECT version, checksum FROM schema_migrations')).rows.map((row) => [row.version, row.checksum]));
    const known = new Set(files.map((file) => file.slice(0, 3)));
    for (const version of applied.keys()) {
      if (!known.has(version)) throw new Error(`Applied migration ${version} is missing from disk`);
    }
    for (const file of files) {
      const version = file.slice(0, 3);
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      if (applied.has(version)) {
        if (applied.get(version) !== checksum) throw new Error(`Applied migration ${version} has changed`);
        continue;
      }
      if (through && version > through) continue;
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [version, checksum]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return (await client.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map((row) => row.version);
  } finally {
    try { await client.query('SELECT pg_advisory_unlock($1)', [lockId]); } finally { await client.end(); }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrate(process.env.DATABASE_URL).then(
    (versions) => console.log(`Applied migrations: ${versions.join(', ')}`),
    (error) => { console.error(error.message); process.exitCode = 1; },
  );
}
