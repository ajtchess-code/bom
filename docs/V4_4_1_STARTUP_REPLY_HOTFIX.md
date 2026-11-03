# BOM v4.4.1 — Startup and Discord Reply Hotfix

This cumulative update applies over **v4.3.0 or v4.4.0**. It includes all v4.4.0 Admin, OpenAI credential and Port Battle invitation changes.

## Install

1. Stop the server and overlay the ZIP contents directly into `/home/container` (the repository root). Allow existing files to be replaced, including `apps/controller/src/knowledge.ts`.
2. Keep your existing environment files. None are included in this package.
3. Start the server using the existing source-build bootstrap. It rebuilds packages and runs pending database migrations. If using a manual startup instead, rebuild all workspaces and run the database migrations before starting services. Migration 031 is included from v4.4.0; installations that already applied it need no additional migration.
4. Verify startup completes, then test the Port Battle signup buttons, private music controls/filter menus, and `/wiki ask`.

## What the supplied log showed

- The immediate restart loop was a TypeScript build failure in a stale `apps/controller/src/knowledge.ts`. It imported five helpers no longer exported by the workspace database package. That legacy file was absent from the reconstructed source used for previous builds, so an update-only overlay had not replaced the server's copy. This release includes an explicit source tombstone to replace it. The current `/wiki` implementation remains in `index.ts` and uses the authenticated Wiki API.
- An earlier controller crash followed a Discord `50035` rejection: a top-level type-17 Container was sent in an interaction edit without the Components V2 flag. Deferring a reply does not establish that flag on the resulting message. Edits now set it explicitly, clear legacy content/embed fields, and place fallback text in a TextDisplay when required.
- Several interaction branches returned `void` on an asynchronous call without awaiting it. Rejections could bypass their surrounding `try/catch`. Those controller branches now await the reply work, keeping failures inside the existing interaction error handling.
- Private-panel maintenance edits use the same V2 payload normalization. Interaction error summaries omit raw Discord request objects and webhook URLs.

The helper keeps legacy text/action-row replies in their existing format. Deferred replies retain their ephemeral setting while V2 is applied on the subsequent message edit. Message-edit flags are limited to the flags Discord permits for edits.

Protocol references: Discord's official [interaction response documentation](https://github.com/discord/discord-api-docs/blob/main/developers/interactions/receiving-and-responding.mdx) and [message edit documentation](https://github.com/discord/discord-api-docs/blob/main/developers/resources/message.mdx).

## Separate host connectivity finding

The log's Cloudflare prechecks passed DNS and both QUIC/HTTP2 for region1, but failed QUIC and HTTP2 for region2. This hotfix does not change tunnel routing or firewall settings. If dashboard connectivity remains unreliable after the bot builds successfully, that requires checking the host's outbound connectivity to Cloudflare; the supplied excerpt does not establish a successfully registered tunnel.

## Verification

- All seven workspace builds passed: shared, database, Redis, controller, worker, API and production dashboard.
- All 14 repository regression tests passed, including new coverage for raw/builder V2 payloads, deferred V2 error messages, component updates, preserved legacy replies, valid edit flags, catchable request rejection and the stale Wiki source replacement.
- No live Discord messages were sent for validation. Test the affected buttons after deployment to confirm behavior against the live Discord API.

Admin layout and invitation installation details remain in `docs/V4_4_ADMIN_INVITATIONS.md`.
