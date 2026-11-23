# Manual actions for production publishing

This checklist covers actions that require the founder's provider accounts, billing decision, or permission to make a live post. It is not evidence that a channel is connected. Update each checkbox with a date and a nonsecret result or blocker. Never put client secrets, access/refresh tokens, authorization codes, passwords, database URLs, or screenshots containing them in GitHub or this file.

## 1. LinkedIn developer application — [issue #5](https://github.com/hiteshiat1/pubxstudio/issues/5)

- [ ] Sign in to [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps), create or select an app controlled by you, and confirm the associated company page and app owner.
- [ ] In **Products** and **Auth**, check which products and scopes the app actually has. For member text posts, confirm `w_member_social`; for organization posts, confirm `w_organization_social` and any required organization discovery permissions. LinkedIn's [Posts API permissions](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) and [OAuth guide](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow) are the references. Access depends on approved products; do not assume a requested scope is granted.
- [ ] Confirm which company pages the connecting member may publish for and their page role. Record page names and nonsecret page URNs only after the app can discover them. If organization access is denied, record it as blocked; member publishing may still proceed.
- [ ] Once the application callback route is implemented, register its exact HTTPS production and staging URLs in the app's **Auth** tab. The URL must exactly match the OAuth request. Confirm the redirect works without sharing the code or token.
- [ ] Record the app name, nonsecret client ID, granted products/scopes, redirect URL host/path, page eligibility, and any review status in issue #5. Put the client secret only in the deployment secret manager.

## 2. X developer application and cost decision — [issue #10](https://github.com/hiteshiat1/pubxstudio/issues/10)

- [ ] Sign in to the [X Developer Portal](https://developer.x.com/) and confirm the project, app, and account that will own posts. Check the current write API availability, request limits, and pricing shown in your console. Prices and eligibility can change.
- [ ] Decide whether to enable any paid access. **Do not buy credits or accept a charge solely for this checklist.** Record an explicit approved budget or “no spend approved” in issue #10.
- [ ] In the app's user-authentication settings, enable OAuth 2.0 authorization code with PKCE and confirm the permissions needed for posting, identity lookup, and refresh if offered. Record the granted scopes by their exact names, not the requested names.
- [ ] Once the X callback route is implemented, register its exact HTTPS production and staging URLs. Confirm the connecting X account owns the intended profile and that the callback works without sharing codes or tokens.
- [ ] Record the nonsecret app/client ID, callback host/path, granted permissions, account handle, pricing/limit decision, and any access blocker in issue #10. Keep client secrets only in the deployment secret manager.

## 3. Hosting, secrets, and production acceptance — [issues #20](https://github.com/hiteshiat1/pubxstudio/issues/20) and [#21](https://github.com/hiteshiat1/pubxstudio/issues/21)

- [ ] Choose the production web, worker, and PostgreSQL hosting arrangement and approve any new spend before provisioning. Provide the public HTTPS origin and staging origin so exact OAuth redirects can be registered.
- [ ] Configure `DATABASE_URL`, `PUBX_CREDENTIAL_KEYS`, `PUBX_CREDENTIAL_ACTIVE_KEY_ID`, and provider app credentials in a managed server-side secret store. Follow [database setup](db/README.md); generate encryption keys locally and never paste them into chat or issues. Arrange backups and test a restore in staging.
- [ ] Review the exact proposed test post text, destination account/page, and time before authorizing **each** live LinkedIn or X post. A successful mock test does not count. Approve any X API charge separately.
- [ ] After a controlled live test, record only the real provider post ID/URL, timestamp, account, and outcome in issue #21. Remove the test post manually if desired after recording evidence. Mark a provider channel blocked if its permissions or billing do not allow the test.

## Current state

The database schema, encrypted credential primitive, and LinkedIn Posts API adapter have been implemented. The app currently does **not** offer authenticated account connection, a live publishing workflow, or a deployed worker. Do not treat a draft export or a mocked provider response as a live publication.
