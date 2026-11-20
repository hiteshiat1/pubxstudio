# PostgreSQL schema (PUB-02)

This directory provides the persistent data foundation from the [PUB-01 audit](../design/pub-01-architecture-audit.md). It does not connect the existing editor or publish action to the database yet. Those paths remain unsafe for production publishing until the credential, roles, approval, and queue issues are implemented.

## Configure and migrate

Use PostgreSQL 13 or later. Set a server-only `DATABASE_URL` for a database role that can create tables, indexes, functions, and triggers in its schema. Do not use a browser-exposed environment variable. Back up the database before upgrades. Run migrations once during deployment, before starting web or worker processes:

```sh
DATABASE_URL='postgresql://user:password@host:5432/pubxstudio' npm run db:migrate
```

Migrations are numbered SQL files in `db/migrations/`. The runner records a SHA-256 checksum in `schema_migrations`, uses a PostgreSQL advisory lock to serialize concurrent deploys, and applies each file in a transaction. Re-running it is safe; changing or deleting an applied file fails. Make schema changes by adding a new numbered migration. There is no automatic rollback for destructive changes.

For local integration tests, set `PUBX_TEST_DATABASE_URL` to a disposable PostgreSQL database and run `npm run test:db`. Tests create and remove only a uniquely named test schema. Without this variable the test is skipped. The test verifies fresh install through migration 001, upgrade to 002, persistence after reconnect, repeat migration, cross-workspace foreign keys, idempotency uniqueness, published ID requirement, and revision immutability.

## Schema and limits

- `users`, `workspaces`, and `memberships` identify tenants and actors. Membership roles are recorded but authorization is not yet enforced by application code (PUB-13).
- `social_accounts` stores provider identity and an optional opaque `credential_ref`; it does not store raw tokens. Encryption and token lifecycle belong to PUB-03.
- `content_items` and `content_revisions` store drafts and immutable revision bodies with a caller-supplied SHA-256 digest. The application must compute and verify the digest before insertion; the database currently checks its format. Migration 002 prevents update/delete of revision rows.
- `approvals` bind a revision, account, and actor. `publish_jobs` bind to that exact approval/revision/account tuple. `publish_attempts` require a provider post ID for published status. These tables are a schema contract, not a working queue or approval service. Server-side role checks, current approval checks, leases, retries, and reconciliation are later issues.
- Composite foreign keys constrain related rows to the same workspace. Application queries still need workspace filters and authenticated authorization; SQL constraints alone do not prevent a privileged database connection from reading another workspace.
- No media object storage or key management is configured here. Local `published/` files and browser storage are unrelated to these tables.

For backup and restore, use your managed PostgreSQL service's snapshot/restore mechanism or `pg_dump --format=custom` and `pg_restore` with a maintenance window. Restore into a separate database first, run `npm run db:migrate`, and verify `schema_migrations` and record counts before switching traffic. Do not put database URLs or dumps in Git.
