# v4.3.9 — selected guilds, alliances and Control Desk audit

Cumulative overlay including v4.3.7, v4.3.7a and v4.3.8. Apply over the existing bot; preserve `.env` and persistent data. This is not a standalone full source installation.

## Guilds & Alliances

Blocs are removed from the dashboard, data model and generated chart. Add guilds explicitly from the searchable guild catalogue, create only the alliances you want, and assign tracked guilds to an alliance or leave them independent. Relationship menus contain only the tracked guilds and created alliances. No full-catalogue auto-population occurs, including after clearing the chart.

Use the existing guild catalogue administration to add a new catalogue guild if it is absent from the selector. Tracking a guild here does not grant allied port battle access. Removing a tracked guild also removes its chart membership and relationships. Removing an alliance leaves its guilds tracked as independent.

Migration **103_selected_alliances.sql** removes old bloc grouping and retains previously explicit memberships and relationship endpoints as selected guilds, plus manually created alliances. Guilds that merely appeared automatically are not selected. Historical diplomacy events remain intact. Existing open browser tabs should reload after installation to use the new data format.

Opposite one-way relationships are supported; conflicting mutual/one-way duplicates are rejected. Diagram arrowheads end outside guild circles, opposing relationships use separate curves, and long labels are constrained. Guild references preserve distinct guild identities even when tags differ only in case.

The battle map still shows relevant ports under its existing attack-day rules. Manual guild selection controls the alliance chart, not whether a port can appear on the battle map.

## Control Desk review

The desk now has a Guild Tools dropdown for Dashboard, Port Battles/signups/schedule, Battle Prep, Battle Review, After Action Reports, Wiki, Ship Builder, Ships, Guilds & Alliances, Battle Map, Recruitment, Feedback, Minecraft and Clash of Clans. Destination URLs are fixed server-side and tested against existing dashboard pages. Dashboard permissions remain enforced normally.

My Profile & Ships, Guild Roster, Leave of Absence, donation submission, treasury/ledger and custom Discord role/media requests remain available. Set Preferred Ships opens the Discord selector directly. Request Diplomacy opens the existing private diplomacy request flow; that service must be enabled/configured in membership administration. The separate Music section retains Request Music, queue and playback actions. No Music Controls launcher or public away roster has been reintroduced. Sticky surfaces remain unpinned.

## Bugs found and fixed

- Configured Leave Request/officer roles can manage leave in the dashboard. The configured returning-member review role can review returning members. Those roles do not automatically gain treasury access or guild-operations configuration permissions. PB-only allied accounts remain excluded.
- Leave dashboard requests only the settings/review APIs the member can access, avoiding false authorization errors. Polling preserves unsaved operations settings, including when an older fetch completes during editing. Settings inputs are disabled during submission.
- Treasury/donation retries with an already-used request key and different details now return a conflict instead of silently acknowledging the previous record. Identical retries remain idempotent. Reload the page and inspect the ledger before creating a replacement entry after such a conflict.
- Ship setup rotates its draft token on every new menu render, so an older page cannot remove or overwrite the current page's selections.
- A manually deleted leave thread no longer blocks an officer-approved returning member's other request/role recovery. The existing leave repair process handles rebuilding missing leave threads.
- Public and detailed battle maps retain separate image-cache entries and share identical concurrent renders. Invalidated, older renders cannot replace newer cached data. Live text timestamps remain uncached. Detailed-map summary sorting no longer mutates the caller's port array.
- New dashboard cards align their form controls at the top instead of stretching input/button heights to fill a taller neighbouring card.

## Install

1. Stop the server and back up source/database.
2. Extract this overlay into the project root, overwriting matching files. Keep `.env` and persistent data.
3. Ensure the panel's install command uses Yarn 1.22.22 (`yarn install --non-interactive`) and that disk space/quota is sufficient. Existing ENOSPC and hosting firewall issues cannot be repaired by this package.
4. Install dependencies, run `yarn migrate` (including migration 103), run `yarn build`, then restart with the existing working startup file. No startup-file change is required.
5. Reload dashboard tabs. Check tracked guilds/alliances and save the desired selection. The Discord chart and Control Desk refresh during normal reconciliation; `/membership-admin refresh-console` can request a desk refresh.

## Validation and limits

81 targeted regression tests passed, covering selected chart entities, migration replay, API routes/access, ledger idempotency, ship draft protection, leave lifecycle, permissions, shared music channels, map cache isolation, DM mute and Control Desk links/component limits. The final combined chart/community checks also passed (14 tests). All 49 included migrations applied in an isolated PGlite database. Controller/API builds and the production dashboard build passed. Chromium checks passed for the four new pages at desktop and phone widths with fixture APIs.

This was a focused code review and local test pass, not a claim that every possible bot issue is eliminated. Live Discord permission combinations, audio playback/autoplay, DM delivery, host disk quota and Cloudflare connectivity need operational verification. No deployment or live Discord/ledger changes were performed.
