# Intel 3.1.0 — selected improvements and validation

This update implements the 47 unique selected items. Item 31 was listed twice and is implemented once. Items 8, 10 and 32 were not selected; existing empty-voice behavior is retained.

## Source-side boundary

The source session is observation-only. Its REST request entry point and underlying HTTP transport reject every method except GET. Gateway mutation broadcasts are rejected. Actual source-library API calls for message creation, editing, deletion, reactions, typing and webhook creation are covered by regression tests and are blocked before transport. No source replies, DMs, typing notifications or test messages are generated.

Outgoing reports use a separate destination webhook client. Before every send, edit or deletion, a GET validates the webhook's guild against trusted BOM destination IDs and rejects monitored source guilds. The source account token is never used to deliver a report. Dashboard previews are simulated locally; diagnostics issue reads only.

The integrated launcher obtains the trusted destination ID from the existing root DISCORD_GUILD_ID. Standalone deployments must explicitly supply DESTINATION_GUILD_IDS. An empty allowlist blocks delivery. No new API key is needed.

## Selected feature mapping

| Item | Implementation |
| --- | --- |
| 1 | Route label in message webhook identity, report title, voice title and dashboard. |
| 2 | Explicit server allowlists; auto-discovery cannot broaden to newly joined or unmonitored servers. |
| 3 | Channel, category, wildcard-name and channel-type exclusions, including inherited thread exclusions. |
| 4 | Scope preview shows included/excluded channels and the reason; rule changes have a review/apply step. |
| 5 | Independent route pause, resume, voice refresh and read-only access checks. |
| 6 | Timed pauses expire without disconnecting the shared source account. |
| 7 | Connection, pause, unavailable-server, destination-blocked, permission and delivery-delay states. |
| 9 | Persistent delivery, retry, failure and voice-update records with known destination links. |
| 11 | Relay/severity heading, source context, content and supporting metadata hierarchy. |
| 12 | Compact/default presentation with optional expanded source-embed text and source links. |
| 13 | Consistent routine, watch, urgent and delayed colors. |
| 14 | Explicit ROUTINE, WATCH, URGENT, DELAYED and STALE text labels. |
| 15 | Original source and edit timestamps, separate received timestamp and delivery records. |
| 16 | Event age distinguishes delayed activity; a fresh edit to an old message is not misclassified. |
| 17 | Configurable direct source link, marked as requiring source access. |
| 18 | Friendly server/channel labels and route context rather than raw identifiers in report headings. |
| 19 | Known mentions resolve to names; inaccessible mentions become readable placeholders with pings disabled. |
| 20 | Bounded embeds, safe context labels, code-fence-aware splitting and surrogate-pair protection. |
| 21 | Compact reports suppress copied decorative thumbnails; useful attachment media remains available. |
| 22 | Consistent image/video/audio/file labels, upload fallback links and size metadata. |
| 23 | Bounded multi-image galleries; locally uploaded images are referenced as attachments when available. |
| 24 | Source text remains alongside attachments and filename/type details. |
| 25 | Source edits update mapped destination parts and record the edit context. |
| 26 | Per-route removal or deleted-source marker policy; delayed events cannot resurrect deleted reports. |
| 27 | Thread name/context and parent-aware channel routing. |
| 28 | Bounded reply excerpt with an unavailable-reference fallback. |
| 29 | Paragraph-aware, numbered long-message parts within Discord limits. |
| 30 | Optional routine-text burst summaries with per-source history and edit/delete-safe shared mappings. |
| 31 | Stable voice message IDs per page; ordinary refreshes edit existing destination messages. |
| 33 | Voice join, departure and channel-move changes. |
| 34 | Debounced voice changes, including relevant mute/deafen/stream updates. |
| 35 | Voice participants grouped by named server/channel. |
| 36 | Per-channel and overall participant counts. |
| 37 | Uniform 32-pixel avatars with initials fallback in voice images. |
| 38 | Reported streaming/mute/deafen indicators with a legend; no inferred speaking status. |
| 39 | All occupied voice channels paginate into stable messages instead of being silently truncated. |
| 40 | Last-observed time and stale/unavailable source state; disconnection does not imply an empty channel. |
| 41 | Structured Intel archive filtered by route, captain/content/channel search, channel ID, status and date range. |
| 42 | Saved officer filter views, including their account/route. |
| 43 | Normalized watchlists match content, captain names, server/channel labels; voice names can be highlighted. |
| 44 | Explicit destination role allowlist and cooldown; arbitrary user/everyone/here pings remain disabled. |
| 45 | Persistent fingerprints/mappings, duplicate-event counters and overlapping-route configuration rejection. |
| 46 | Priority-aware destination queue with aging; active requests are not interrupted and same-message work stays ordered. |
| 47 | Read-only destination verification and source View Channel/Read Message History diagnostics. |
| 48 | Shared-renderer report previews with routine, long, reply/edit, attachment and delayed examples. |
| 49 | Session-attributed configuration revisions and restore; historical credentials are stored encrypted, never returned by the API. |
| 50 | Daily/weekly/monthly-window event totals, delay, failures/retries, duplicates, burst events and voice freshness. |

## Defaults and operation

- Compact reports and source links are on. Delayed reports use a five-minute threshold.
- Burst grouping is available but off until configured; only routine text is grouped. Attachments, replies and urgent/watch reports remain separate.
- Watchlists and alert roles start empty. Existing configuration is retained.
- A route pause suspends new forwarding, including source updates; resume does not backfill the paused period.
- Voice pages show up to three channel groups per image and continue as additional stable destination messages.
- Structured history begins with events observed after this upgrade. Existing destination mappings remain available. New archive/delivery tables are created automatically in the relay's SQLite databases.
- Archive and delivery records retain 30 days; existing mapping retention remains 90 days. Saved views persist. Up to 500 encrypted configuration snapshots are retained.
- Config restore keeps current credentials for existing routes; removed sub-routes can recover their encrypted historical destination credentials. Destination validation still applies after restoration.
- One voice identity migration can replace a legacy voice post once. Routine updates then edit the same messages.

## Validation and practical limits

- All seven BOM workspaces passed their normal production build scripts: shared, DB, Redis, controller, worker, API and Next.js dashboard.
- The Intel TypeScript build and all 57 Intel regression tests pass. Tests cover the actual source API mutation guard, destination rejection/revalidation, scoped exclusions, pauses, report formatting, archives, duplicate suppression, alerts, burst races and configuration restore.
- All 28 targeted port-battle, welcome and Intel integration regression tests pass.
- Dashboard DOM interaction checks exercised account selection, report preview, scope review/apply, timed pause and tabs. Literal DOM references and script parsing are also included in the Intel test suite.
- Generated voice images were rendered and visually inspected, including long names and multiple status indicators.
- No live Discord login or message delivery was performed. Browser-layout testing could not run because the Chromium download was unavailable; the dashboard received DOM checks, not a live browser screenshot review.
- Webhooks cannot provide a transaction with local SQLite. Normal duplicate events and known retries are suppressed; an ambiguous network failure after a remote send may still require checking the destination before retrying.
