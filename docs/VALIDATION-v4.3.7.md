# v4.3.7 validation

## Completed locally

- Shared, database, Redis, controller, worker and API TypeScript builds passed.
- Next.js 16.4.2 production dashboard build passed, including all new routes.
- 70 targeted regression tests passed. Coverage includes DM mute/expiry, recommendation exclusions, queue/recovery behavior, live map timestamp responses, port protection math, map history/multiple taxes, guild identity/retirement, sticky message lifecycle, missing/deleted battle cards, welcome lifecycle, permission composition and API batches, donation verification, exact integer treasury/reversals/idempotency, leave ownership/long-leave acknowledgement/thread lifecycle, diplomacy revisions, ship setup paging/expiry/stale-menu protection, schedule filtering and cinematic banner generation.
- Permission tests were rerun after adding idempotent handling for channels already changed by category propagation: 4 passed.
- All 47 SQL migrations applied successfully in an isolated PGlite database. Migration 100 reapplied successfully. No production database was accessed.
- Four new dashboard pages rendered in Chromium at 1440px and 390px without horizontal page overflow or JavaScript errors. Preset selection and diplomacy draft editing passed interaction checks. The tests use fixture API responses.
- Generated banner images were inspected. Heading and guild text use trimmed glyph bounds and the relevant BOM/faction template's nameplate centre, including reversed opponents. Unicode and long port names rendered successfully.
- Welcome portrait geometry and the new mobile permission page were inspected. The portrait fits the existing frame at centre (1654,317) in the 1841×547 artwork.

## Not live-verified

No live Discord messages, role changes, permission changes, thread creation, donation decisions or treasury entries were performed. No external service was deployed. Live Discord role/channel permissions, DMs, worker audio, returning-member audit logs and remote music/search services need post-install verification.

The crafting proposal distinguishes prior conversation requirements from inspected source: the available historical Novonode archive was an early music package, not the old Python crafting tracker. Recipe quantities in that proposal are historical references, not verified current game data.
