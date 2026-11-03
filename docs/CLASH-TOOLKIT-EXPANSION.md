# BOM Clash toolkit expansion

This update adds the Tools tab to the existing Clash of Clans dashboard. Apply it over the previously delivered Game Hubs / Recruitment / PB update. It does not deploy itself.

## Install

1. Back up the existing application and database.
2. Overlay the archive's `implementation/` directory onto the existing project root.
3. Run the normal database migration process through `040_clash_toolkit.sql` before starting the updated API or controller. The migration adds tables only and is replay-safe.
4. Run `npm install`, then build shared, DB, API, controller and dashboard using the existing workspace build process. Keep the `data/clash/catalog.json` and `third_party/` directories in the deployed project root; the API loads the catalog relative to its source/dist location.
5. Restart the API, controller and dashboard together. No additional environment variables are required. Existing Clash API credentials, verified account linking, reader/manager roles and notification settings still apply.
6. Open Dashboard → Clash → Tools. Import a village linked to your Discord account; confirm the displayed tag, timestamp, levels and any warnings.

The archive contains source, migration, catalog, licenses, tests and this guide. It contains no `.env` files, installed dependencies, build outputs, private exports or browser screenshots.

## Included tools

| Tool | Working behavior | Data boundary |
|---|---|---|
| Village import | Validate pasted/file JSON; expand repeated structures; delete saved import | Only verified own accounts; older snapshots rejected |
| Builder timeline | Separate builder/lab/pet lanes per village/base; drag/reorder; time reduction; save/load/export | Next-level candidates, imported active timers, resources assumed available |
| Upgrade advisor | Offense, war, balanced and maxing priorities with reasons/prerequisite blockers | Explainable heuristic; no optimality claim |
| Magic items | Compare books, hammers and builder/research/pet potions | Per-task estimates; check matching item eligibility in game |
| Equipment & ore | Level-to-level costs, inventory deduction, income-based duration | Income and inventory entered manually |
| Army library | Official army-link parser; troop/spell housing; strategies/equipment; ratings/comments | Unknown units retained with incomplete totals labeled |
| Base library | Official layout links, purpose/TH, screenshots, last-tested date, ratings/comments | User-supplied layouts and testing notes |
| Attack planner | Screenshot drawing with arrows, paths, labels; undo; save/load; PNG/JSON export | Manual annotations; no gameplay execution |
| Spell calculator | Level-specific Lightning/Earthquake model with diminishing quake damage | Ordinary non-immune, non-supercharged targets only; assumptions shown |
| Attack reviews | Video links/player, timestamped coaching comments and seek | User-supplied replay videos |
| Practice board | Schedule sessions; coach/base-provider/participant roles; attempt counts/discussion | Manual coordination |
| War readiness | Village availability, heroes/equipment readiness and preferred army | Author declarations; stale/expired declarations ignored by lineup |
| War performance | Deduplicated observed wars, raw stars, triples, fresh/follow-up hits and TH matchup | Retained snapshots only; missing order stays unclassified |
| CWL lineup | Explainable candidates, availability, rotation, account caps; saved officer plans | Officer suggestions; actual selection done in game |
| CWL scenarios | Editable points, remaining stars/wins, bonus and destruction assumptions | User-entered what-if scenarios |
| Clan health | Retained roster changes, donation deltas/reset flags and missed attacks | No online or last-seen inference |
| Recruit comparison | Official player API vs thresholds; officer prospect pipeline | Unknown profile fields stay unknown |
| Clan transfers | Officer village movement plans, timing, approval/completion/cancellation | Manual status; no automatic clan movement |
| Clan Games | Clan/member goals and verified-village progress submissions | Self-reported contribution totals |
| Capital priorities | District upgrade targets, priorities and contribution submissions | Self-reported contributions |
| Season reports | Observation-month report, Markdown/CSV export and publication in Clash | Collection history only; not complete lifetime/season history |
| Recognition | Officer awards and observed attack leaders with sample sizes | Manual recognition; observed leaders require at least three attacks |

## Permissions and reminders

Member tools use the existing Clash reader gate. Manager actions additionally use the Clash manager gate. Private records remain visible only to their author, including against other managers. Recruitment, transfers and lineups are forced to officer visibility and the editor shows that restriction. Shared edits use revision checks to prevent silent overwrites. Imports are private and normalized; raw exports are not stored.

Practice starts, Clan Games deadlines and planned transfers create deduplicated Clash notices for their author and participants. Imported active timers create estimated-completion notices for the importer. All notices stay in the Clash section. Discord delivery uses the existing opt-in settings and central notification preferences. Timer estimates require confirmation in game and a fresh export; they are not live server timers.

## Open-source reuse

See `THIRD-PARTY-NOTICES-CLASH.md` and `third_party/` for exact commits and complete MIT notices. The data catalog and potion formula are actual reused foundations; the remaining interfaces and workflows are implemented in this project.

## Validation

- 29 new calculation, database, API authorization and reminder tests passed.
- 13 game-hub/recruitment/PB lifecycle regression tests passed.
- 78 browser section/tool checks passed at 390px and 1440px, plus army inspection/editor, timeline selection and annotation interaction checks. No page errors or horizontal page overflow in those checks.
- Shared, API, controller and dashboard production builds passed.

Commands: `npm run test:clash-toolkit`, `npm run test:game-hubs`, `npm run test:game-hub-ui`.

The browser suite uses a local fixture API. Live Supercell requests, production database migration, Discord delivery and deployment still require the target environment.
