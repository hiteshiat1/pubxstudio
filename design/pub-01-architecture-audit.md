# PUB-01: Current architecture and production publishing gap

Audit of `main` at `d36058c`, 20 November 2026. This is a design review for [issue #2](https://github.com/hiteshiat1/pubxstudio/issues/2); it does not change publishing behavior.

## What is in the repository

| Area | Actual implementation |
| --- | --- |
| Application | Next.js 16 App Router, React 19, TypeScript, one package at the repository root (`package.json`, `src/app/`). The README's `studio/` path is stale. |
| Interface | `src/app/page.tsx` is the landing page; `src/app/studio/page.tsx` is the client-side editor, settings, approval toggle, and publish controls; `src/app/guide/page.tsx` is the guide. |
| Generation | `src/app/utils/llmClient.ts` calls Anthropic, OpenAI, and Gemini directly from the browser. Similar server-side functions exist in `src/app/actions.ts`. Prompt and platform definitions live in `src/app/constants.ts`. |
| Authentication | No application login, user identity, workspace membership, or server-enforced roles. Social connections are manually entered tokens; there are no OAuth routes. |
| Persistence | API keys, social tokens, provider settings, and sync timestamps use browser `localStorage` in `src/app/studio/page.tsx`. Editor history is React state. `saveOutputBundle` in `src/app/actions.ts` writes files under `published/` and `public/images/articles/` on the application filesystem. No database, migration, or durable job store exists. |
| Publishing | `directPublishToAccount` in `src/app/actions.ts` receives a token and content from the browser. LinkedIn calls `/v2/me`, `/v2/userinfo`, `/v2/posts`, then falls back to `/v2/ugcPosts`. X and other platforms return fabricated success and URLs without provider calls. |
| Deployment | `next.config.ts` allows 10 MB server-action bodies; Vercel Analytics is included in `src/app/layout.tsx`. There is no committed deployment topology, worker, health endpoint, backup/restore procedure, or CI workflow. A local `.vercel/` directory is ignored. |
| Tests | No automated test files or test/lint scripts in `package.json`. `sanity-check.sh` exists locally but is ignored by `.gitignore`, so it is not a repository test gate. |

## Gaps against the publishing epic

1. **Trust boundary:** Any client able to invoke the exported publish server action can provide its own `platform`, `content`, and `credentials`. The browser approval toggle is not checked on the server. The server cannot prove which immutable revision was approved, who approved it, or which account is authorized. This blocks a safe production publishing path.
2. **Credential safety:** Social tokens and LLM keys are stored in browser storage and passed as action arguments. There is no encrypted server storage, rotation, revocation handling, or account ownership check. The guide's claim that credentials never touch the server conflicts with the publishing action and dynamic model fetch action.
3. **Provider correctness:** X returns `ok: true` and a synthetic `x.com` URL without posting. Other fallback platforms do the same. LinkedIn uses a placeholder organization URN, attempts a legacy fallback after any Posts API failure, and can claim success with an author URN in place of a provider post ID. No provider identity/role verification or durable result exists.
4. **Durability:** No queue, attempt ledger, reconciliation, retry policy, or persisted publication history exists. `pubx_sync_history` records only local timestamps/error counts. Server filesystem output is not a reliable shared store for a deployed web/worker topology.
5. **Input and isolation:** `saveOutputBundle` accepts `slug` and image names from the client and joins them into filesystem paths without checking for traversal or validating size/type. There is no workspace boundary for any action.
6. **Documentation:** The README and in-app guide describe an old `studio/` directory and overstate live publisher and storage capabilities. These should be corrected when the associated behavior is replaced, so users can distinguish previews from verified posts.

## ADR-001: Proposed database and worker boundary

**Status:** Proposed for founder review. No database or worker is introduced by this audit.

**Decision:** Use PostgreSQL for production records, with versioned SQL migrations. Keep the Next.js web process for authenticated editing, OAuth callbacks, approval, and job creation. Run a separate worker process against the same database for scheduled delivery. The worker claims due jobs in a transaction using row locks, records each attempt, and only marks a post published after a provider response with an actual post ID. A timeout after a remote call leaves an uncertain state for reconciliation instead of automatic reposting. Keep secrets encrypted with a separately managed key, available only to server and worker. Use object storage for media when media publishing is added; do not treat local `published/` as production storage.

**Minimum schema for PUB-02:** `users`/external identities, `workspaces`, `memberships` and roles, `social_accounts` and encrypted credential references, `content_items`, immutable `content_revisions`, `approvals` tied to revision hash and account, `publish_jobs`, and `publish_attempts` with provider IDs, status, timestamps, error codes, and uniqueness/idempotency keys. Define foreign keys and workspace scoped queries. Store no raw token in audit tables. Provide forward migrations and a documented backup/restore path; verify a fresh database, upgrade, and process restart.

**Worker contract:** The web process enqueues only an approved immutable revision and account. The worker rechecks approval, account status, and role policy before the first outbound request. Claiming uses a lease so one job has one active worker. Attempt states distinguish `pending`, `sending`, `published`, `failed`, and `uncertain`. Retries apply only where the provider response proves no post was created, or reconciliation has established that fact. Cancellation stops jobs before the outbound request. Provider adapters return normalized IDs/errors and never synthesize success.

**Why:** PostgreSQL transactions and row locks support a portable web/worker deployment and auditable work claims without an additional queue service. The database remains the source of truth across restarts and instances. The tradeoff is operating a PostgreSQL service and migrations; provider calls and external storage still need separate configuration and authorization. This proposal should be confirmed before PUB-02 implementation.

## Suggested issue order

Review this audit first. Then implement PUB-02 (#3), PUB-03 (#4), and PUB-13 (#14) as foundations. PUB-08 (#9) can follow this audit independently, with current official provider documentation checked during implementation. Human-owned LinkedIn (#5) and X (#10) developer setup can proceed separately. Subsequent OAuth, approval, queue, publishing, and acceptance issues should follow the dependency order in #1. No live post should be used as a test without explicit founder approval.

## Verification performed

- `npx tsc --noEmit` — passed.
- `npm run build` — blocked in this network-restricted environment because `next/font/google` could not download DM Sans, Instrument Serif, or JetBrains Mono. The build also warned that an external `/Users/hitesh/package-lock.json` was selected as the inferred workspace root while this repository contains both npm and pnpm lockfiles. This does not establish whether a network-enabled build passes.
- No test or lint script exists. Provider posting and restart persistence were not exercised because this issue is an audit and no safe provider/database setup exists.
