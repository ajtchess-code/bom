> **Root-host installation:** use `docs/INTEL_RELAY_SETUP.md` in the root overlay. Keep the existing BOM startup command. The relay subfolder is `intel-relay/`.

# Discord Relay Control — user-account edition (3.1.0)

This edition uses `discord.js-selfbot-v13` for the source Discord connection. It logs in with a **user-account token**, not a bot application token. No bot invitation, slash commands or privileged bot intents are used. `discord.js` remains installed solely for outgoing webhook handling and API types.

Forwarded messages and voice summaries still use **webhooks**. They will have Discord's webhook/app presentation in the destination; this is not a tool for posting destination messages as your personal account.

The user-client dependency is archived and unsupported. Local tests do not establish that Discord will accept a token or deliver every event. Live login, channel visibility, existing voice occupants and forwarding require verification on your host. This package does not extract tokens, solve challenges, or bypass channel permissions.

## Source writes are prohibited

The source account is read-only. Source REST mutations and gateway mutations are blocked before transport. Messages, replies, reactions, typing, thread creation, webhook creation and account-setting writes cannot be issued through the source client. Destination delivery uses a separate webhook client and validates that the webhook belongs to an approved BOM server before each write. Monitored source servers are blocked as destinations.

For the integrated BOM host, `scripts/intel-relay.mjs` supplies the approved destination from the existing root `DISCORD_GUILD_ID`. For standalone operation, set `DESTINATION_GUILD_IDS` to the trusted BOM Discord server ID (or comma-separated BOM server IDs). Without an approved destination, delivery is blocked. No new API key is required.

The new **Intel operations** area provides route controls, exclusions and scope review, report previews, watchlists, history, delivery records, operational summaries and configuration restore. See `docs/INTEL-v3.1.0-FEATURES.md` in the root patch for the selected-feature mapping and installation notes.

## Quick start (Windows / Linux)

1. Install Node.js **22.21.0 or newer within 22.x, or Node.js 24+**.
2. Extract the ZIP and enter `discord-relay-ts`.
3. Copy `.env.example` to `.env` and set `DASHBOARD_PASSWORD` to a unique password of at least 16 characters.
4. Run:

```sh
npm ci --ignore-scripts
npm run build
npm start
```

Windows shortcuts: `run-local.bat` or `run-local.ps1`. Hosting shortcut: `sh novonode-start.sh`.

5. With the supplied Cloudflare settings, publish `intel.bandofmisfits.org` to `http://127.0.0.1:8196` and open **https://intel.bandofmisfits.org**. For local-only testing, set `PUBLIC_ORIGIN=http://127.0.0.1:8196` and `COOKIE_SECURE=false`, then open that local URL.
6. Choose **Add account**, enter a label, user token and destination webhook. Enable **Connect this account after saving**, then save.
7. Choose a guild and turn source channels on or off. Click **Save channel selection**. No channels are selected by default.
8. Optional: set a separate voice webhook and comma-separated voice guild IDs. An empty voice guild list uses only the explicitly monitored source servers.

## Terminal dashboard appearance

Version 3.0.1 adopts the supplied terminal-style reference: charcoal panels, monospace typography, cyan labels, yellow controls and thin panel borders. The top overview shows real account, connection, explicit channel-selection and error counts. Status values update when account status is refreshed; the clock shows local browser time. Green/red indicators include text labels. The layout adapts to narrow screens and retains visible keyboard focus. No external fonts or assets are loaded.

## Dashboard behavior

- Add multiple accounts, replace a saved token, connect/disconnect or remove an account.
- Blank token/webhook fields on an existing account retain their saved values. Use the dedicated checkbox to remove a voice webhook.
- Tokens and webhook URLs are never returned by the account API or filled back into the browser.
- Account changes restart that account connection. Avoid changing settings while important messages are being sent; events during a disconnect are not backfilled.
- Channel selections are explicit. Guild selection only chooses which tree to browse; it never enables an entire guild implicitly.
- Selecting a channel/forum includes its threads. A listed thread can be explicitly excluded. Categories group channels and are not implicit selection rules.
- The channel tree uses the account's channel cache plus current View Channel permission checks. Archived/unjoined private threads may be absent. Permissions can change after the tree loads.
- Configuring multiple accounts for the same source and destination can intentionally produce duplicate relays; deduplication is per account.
- Removing an account erases its saved credential record and stops its connection. Previously relayed messages and historical SQLite mapping files remain.

## Hosting

Defaults bind to loopback. On a panel host, set `DASHBOARD_HOST=0.0.0.0` and assign `DASHBOARD_PORT` to your allowed port. Put the dashboard behind HTTPS and set `COOKIE_SECURE=true` when using HTTPS. Keep the original browser Host header when proxying. Do not expose the dashboard over public plain HTTP.

If using this beside another application, choose a free port. The supplied configuration uses **8196**, separate from the existing BOM dashboard. `PUBLIC_ORIGIN` binds mutation checks to the browser-facing hostname even behind a reverse proxy.

Docker:

```sh
docker compose up -d --build
```

Compose exposes the dashboard only on `127.0.0.1:8196` and keeps data in a named volume. The container runs as the `node` user and has an HTTP health check. Docker itself was not available for a full container run in the test environment.

The public `/healthz` endpoint returns only `{ "ok": true }`; it does not reveal account names or guild counts. Authenticated dashboard account status shows whether each Discord client is connected. Blank `DASHBOARD_PORT` uses 3000; zero is invalid.

## Data and credentials

The data directory contains `accounts.enc` (AES-256-GCM encrypted account settings), `accounts.key` (random encryption key, owner-only permissions on POSIX) and per-account/per-destination SQLite databases. Back up the **whole directory**, including the key. Anyone with both files and filesystem access can decrypt the credentials. Windows administrators should restrict the folder's ACL to the service user. The dashboard password protects browser access; changing it invalidates sessions on restart but does not change the encryption key.

Sessions last eight hours and use HttpOnly/SameSite cookies. Mutation requests require same-origin JSON. Login attempts are rate-limited by socket IP. Behind a reverse proxy all users may share this limit. Configure tokens locally in the dashboard; do not send them in chat.

## Relay fixes and behavior

- Per-message operation queues preserve deletes and edits that arrive during attachment downloads or creation.
- Every successfully sent part is mapped immediately. Pending deletions survive restarts and are retried every minute. Failed deletions retain mappings; a confirmed unknown message is treated as already removed.
- Message updates refresh previews, but the **Edited** label comes from the source `editedTimestamp`; embed unfurls alone do not add it.
- Attachments are refreshed on edits, including removals. Oversized/download-failed files become source links. Rejected file uploads retry with source links. The source-message link is always retained. Discord CDN URLs may expire; links are not permanent attachment backups.
- Downloads are streamed with a per-file byte cap and timeout. Default cap is 10 MiB per attachment; destination limits may differ. Only the first 10 attachments are considered.
- Reserved webhook names fall back to `Message Relay`; the original sender remains in source metadata.
- Copied embeds are constrained to 10 embeds and a combined 6,000-character text budget. Unsupported fields are omitted. Content URLs represented by copied embeds are bracketed to suppress a second automatic preview.
- System messages are skipped. Stickers become links. Polls get a question/source pointer when exposed by the user-client library; native interactive polls/vote state are not recreated.
- Guild and channel filtering is restrictive, not additive. The dashboard uses explicit channel IDs with thread exclusions.
- Voice refreshes are serialized and use voice-state cache entries even if a member object is missing (an ID is displayed as fallback). Sorting groups channels by parent category then position. A periodic refresh repairs failed voice updates.
- Mapping retention is 90 days; audit retention is independently 30 days. Cleanup runs each minute and preserves pending-delete mappings.
- Text splitting preserves surrogate pairs and closes/reopens standard triple-backtick code fences across chunks.
- Graceful shutdown drains in-flight relay and voice operations; fatal uncaught errors stop the process for supervisor restart.

## Verification

Run `npm run build` and `npm test`. The regression suite covers relay races, pending-delete retries, attachment fallback, embed labels/budgets, filters, SQLite persistence, voice serialization, encrypted credential storage, dashboard authentication/origin checks and text splitting.

Before unattended use, test in channels you control: send text + an attachment, edit it, rapidly send/delete a message, post a URL, move in/out of voice, then restart with someone already in voice. Confirm the destination and account connection status. No live Discord token was used during development.

## Known limits

- User-client upstream is archived; protocol changes may break login or event delivery.
- Disconnects are not backfilled. Process termination between an accepted remote send and its database commit can still produce an orphan. Ambiguous network errors can also make exactly-once delivery impossible.
- Channel trees and voice reports are based on events/cache available to the user session, not a guarantee of complete server membership.
- Changing a webhook starts a new mapping namespace. Old destination posts are not migrated or deleted.
- Voice status is truncated to fit one message. Complex Markdown formatting beyond standard code fences may not preserve perfectly across splits.
