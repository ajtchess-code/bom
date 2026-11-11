# Casino and community update

This update replaces configurable temporary voice rules with the fixed join-to-create channel `1554170868555448350`, moves application work into Discord, replaces the fitting editor with screenshot builds, and adds The ßǾM Casino.

## Deployment

Run the normal repository update and startup/build process. PostgreSQL migrations 120–123 must run before starting the controller/API. The existing bootstrap migration runner applies them. Old zip deployments also remove retired permission preset and recruitment dashboard source files during bootstrap.

No new environment variables are required. Existing Discord bot, guild, database, internal API and dashboard settings are reused. Back up PostgreSQL before updating.

The retired private channel layout no longer runs, and the bot does not restore or otherwise change category or channel permissions: they stay exactly as they are on the server. Saved snapshots remain in `channel_layout_backups` for reference only.

The bot needs Manage Channels and Move Members for voice creation, plus View Audit Log for recovering a channel created in the brief interval between Discord creation and database persistence. Normal restarts recover from persistent session rows. Empty timers survive restarts; if an occupied channel became empty while offline, the 15-minute grace begins when emptiness is first observed. Reconciliation runs every 30 seconds. Only persisted sessions or channels with the bot's creation audit reason are adopted. No channel is deleted based only on its name.

Existing tracked rooms are normalized to the new names, permissions and placement. Existing application channels are renamed to `app-<captain-name>` and their controls refreshed. Join-channel updates refresh temporary-room permissions too.

## Applications

Use `/apply` to submit an application. Inside its channel, use the Recruiter Tools button or `/recruitment-tools` to claim/assign, change review/interview stage, request information, send a saved or custom message, schedule an interview, accept, decline or close. Saved messages have an editable preview modal before sending. Recruiter notes are removed. Acceptance retains the existing administrator requirement; other staff actions retain recruiter role checks. Applicant withdrawal remains available.

The dashboard application page links to Discord channels. Admin → Recruitment manages basic roles/category and saved messages. Historical notes and application audit events are retained in storage; the note-writing endpoint and old workspace are removed.

## Build library

The existing `/dashboard/ship-builder` link now opens the screenshot build library, preserving bookmarks. Choose rate, ship, title, description and screenshot. Create nested personal or guild folders and move builds between destinations using Edit. Personal builds and screenshots require their owner's session, even with a direct link. Guild builds are shared with guild members; their creator retains edit/delete rights. Empty folders can be renamed or deleted by their creator.

Images accept PNG/JPEG/WebP up to 8 MB and are decoded, resized and stored as WebP in PostgreSQL, including backups. The old fitting-editor records remain available in database backups rather than being deleted. Public screenshot builds feed the Port Battle assignment dropdown; old historical build references are retained. Deleted library builds clear future roster references.

## Casino setup

Open `/dashboard/casino`. Admin controls are under `/dashboard/admin/casino`.

1. Publish material exchange rates when ready. No rates or starting balances are invented. Rates support eight decimal places; whole-coin credits round down after multiplying by deposited quantity.
2. Members deposit materials into the Guild Fort and submit a screenshot and quantity. Requests stay pending until an admin verifies the receipt and approves it at the current published rate. Approval credits once and records the reviewer, note, amount and ledger reference. Rejected requests credit nothing.
3. Fund the house from an admin's approved coin balance using the house contribution form. Coinflip cannot accept stakes exceeding available house coverage. Port Battle fees replenish the reserve.
4. Verify Port Battle outcomes and player stats in Admin, with an evidence link/reference. Submitted results are final and settle matched bets transactionally.

Coinflip is server-generated with `crypto.randomInt(2)`, exactly two equally likely outcomes, a 2× stake return on wins, and no fee. There is no configured maximum bet; wallet balance and reserve coverage apply. Idempotency keys recover a saved flip after a lost response. The UI animates the saved server result. PostgreSQL numeric storage and BigInt arithmetic avoid floating-point balance errors.

Port Battle offers use equal stakes. Both stakes are escrowed. The creator backs all selections; the opponent wins if at least one fails. Offers can be cancelled until matched, and unmatched offers expire at the first battle start with a full refund and no fee. Matched bets settle only after every battle result is final. Any void battle or missing required player evidence refunds both sides. The 2% house fee applies to the winner's profit (one stake), rounded down to a whole coin. The winner receives both stakes minus that fee. Fee rate is fixed on the offer. Rankings support exact rank, top N and bottom N; bottom N requires the total ranked player count. Multi-bets must use battles on the same Central calendar day.

All coin movements are recorded in the ledger. Wallet updates, escrow, acceptance, settlement and refunds use a guild transaction lock, preventing concurrent double spends. Financial history and screenshots persist in PostgreSQL. The dashboard shows recent history (100 flips, 200 ledger entries and up to 300 wagers/requests); underlying records remain stored.

Generated artwork is in `apps/dashboard/public/casino/{heads,tails,lounge}.webp`. It was generated as a three-panel pirate casino sheet (gold ßǾM skull coin, matching ship reverse, candlelit nautical casino) and cropped into production assets.

## Validation

Run:

```sh
node --test scripts/tests/build-library-casino.test.mjs scripts/tests/temp-voice-recovery.test.mjs
npm run build
```

Tests use PostgreSQL-compatible PGlite and mocked Discord objects. They do not connect to the live Discord guild or use real player balances. A live staging smoke test should verify Discord permission restoration/positioning and real material receipt review before guild launch.
