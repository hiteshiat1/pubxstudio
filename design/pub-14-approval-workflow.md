# PUB-14: Server-side content approval

`db/content.mjs` creates content items and immutable revisions with a server-computed SHA-256 digest. Authenticated founders and operators may create and edit drafts. Authenticated founders and approvers may approve the latest revision for a specific connected social account. The transaction locks the content item, verifies the revision body against its digest, and requires the account to belong to the same workspace. A partial unique index prevents two active approvals for the same revision/account.

Creating a new revision revokes all active approvals for that item, adds immutable `approval_events` rows identifying the actor and reason, and cancels pending jobs tied to those approvals. Manual revocation has the same pending-job effect. A job already sending may have reached a provider; it remains for later reconciliation rather than being called cancelled. The existing direct publish action still fails closed.

Authenticated same-origin endpoints:

| Operation | Route | Body |
| --- | --- | --- |
| Create item and first revision | `POST /api/workspaces/{workspaceId}/content` | `{"title":"...","body":"..."}` |
| Add revision | `POST /api/workspaces/{workspaceId}/content/{itemId}/revisions` | `{"body":"..."}` |
| Approve latest revision for account | `POST /api/workspaces/{workspaceId}/approvals` | `{"revisionId":"uuid","accountId":"uuid"}` |
| Revoke approval | `DELETE /api/workspaces/{workspaceId}/approvals/{approvalId}` | none |

These endpoints take the session cookie and perform database role and workspace checks. They never accept an actor ID or an approval flag from the request body. `db/migrations/005_approval_audit.sql` adds the active-approval uniqueness constraint and immutable audit table. A full editor/account UI and the publishing queue are separate issues. Approval alone does not send a post.

Verification: `npm run test:db` against disposable PostgreSQL covers role and cross-workspace denial, duplicate and stale-revision rejection, exact account binding, pending-job cancellation on edit, manual revocation, and audit immutability. `npm run build` passed. An HTTP check against the built app and disposable database confirmed create/approve/edit, automatic revocation, stale revision denial, and missing-origin denial. No live provider post was made.
