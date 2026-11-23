import { databasePool } from '../db/pool.mjs';
import { runOnePublishJob } from '../src/server/publish-worker.mjs';

let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

const pool = databasePool();
while (!stopping) {
  const client = await pool.connect();
  try {
    await runOnePublishJob({ client });
  } catch {
    // Keep logs free of provider errors, authorization codes, and credentials.
    process.stderr.write('Publish worker iteration failed\n');
  } finally { client.release(); }
  if (!stopping) await new Promise((resolve) => setTimeout(resolve, 2000));
}
await pool.end();
