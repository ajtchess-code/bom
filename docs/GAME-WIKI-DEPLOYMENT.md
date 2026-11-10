# World of Sea Battle encyclopedia replacement

This replaces the dashboard wiki landing page, routes the former topic/article pages into the new encyclopedia, and moves the standalone ship-tree page into the wiki. The current game export also supplies Discord `/wiki search`, source-backed `/wiki ask`, and the community question service.

## What is included

- All **77 tables** in `AI-MANIFEST.json`, without dropping their original fields or IDs.
- All **3,829 exported PNGs**, including gray variants and atlas sprites. Entity references remain separate from filename candidates.
- Ships and hull models, construction and materials, 44 upgrades, 595 customization records, nine lanterns, crew and specialists, captain skills, cannons, ammunition, powder kegs, resources, recipes and production chains.
- Ports, trade routes, price limits, world placements, NPCs, waves, activities, guilds, benefits, achievements, collectibles, chests, store/system text and the client game guides.
- Source evidence, schemas, enums, methods and the 2,629,403-row model-string table, with indexed pagination rather than loading it into the API heap.
- English-name joins for generic crew labels, with a separate name-source reference; source records are unchanged.
- Original decoded JSON and method evidence files. Original executable/binary client assets and audio are retained in the original export folder, not installed into the website.

## User-facing tools

Browse by game system; search across game/reference records; filter by category; switch cards/tables; open complete records with images, source references and explicit related records; compare up to six entries; export the visible page or comparison to CSV; download original table data in parts.

The crafting planner traces the supplied resource recipes, aggregates shared intermediate demand before whole-batch rounding, shows leftovers and summed production work, asks for ambiguous recipe choices, and rejects cycles. It does not claim to calculate ship/cannon/upgrade recipes that are absent from the supplied resource-recipe table. Their supplied costs/materials remain browsable as separate collections.

The shipyard reuses the old row arrangement with the exported client icons and five-band shipyard background. It preserves distinct same-name source records. Its 84 source records include internal/test and special variants; this is not a claim that all 84 are ordinarily obtainable playable hulls. The export does not establish exact runtime placement or prerequisite edges. Client labels such as Unity are retained; prior community corrections are not silently substituted for source fields.

## Offline Novonode install (works without GitHub release uploads)

1. Back up the existing host files and database, and stop the bot while replacing files.
2. Upload and extract `wiki-code-update.zip` at the bot's project root, allowing replacement of the listed source files. The archive is an overlay, not a complete fresh installation of the bot.
3. Upload the 54 `wiki-part-NNN.zip` files from the `Wiki-Release` folder. **Every ZIP is below 45,000,000 bytes**, safely below the 50 MB host limit. Keep `release.json` with the parts if using the checked installer.
4. Choose one installation method:
   - **File-manager extraction:** create `data/wiki-v2` at the bot root. Extract **each** data part into that same directory. The directory should contain `catalog.json`, `display-names.json`, `tables`, `indexes`, `Images`, `CodeArchive`, `CodeEvidence` and `RawData`. Do not start after extracting only the first part. No environment change is required for a first install.
   - **Checked installation at startup:** put the ZIPs and `release.json` together in `wiki-uploads`, set `WOSB_WIKI_LOCAL_RELEASE=wiki-uploads/release.json`, and restart normally. The installer verifies each ZIP's size, SHA-256, CRC and paths before extraction, then activates the complete release. Subsequent starts skip a release already active.
   - **Host shell, if available:** `node scripts/wiki-release.mjs local wiki-uploads/release.json` performs the same checked installation.
5. Start the bot normally. Its existing startup process builds the changed source. Open Dashboard → Wiki. The former Ships page opens the wiki shipyard.

The data release is about **1.78 GB compressed** and **2.25 GB unpacked**. Allow roughly **5 GB free space for a first checked install**, plus the application's normal storage. Updates keep older release directories, so budget additional space or remove obsolete release folders after confirming the new release. Remove uploaded ZIPs after a successful checked installation if you need to reclaim space. Never remove the currently active release directory.

If `data/wiki-active.json` already exists from a prior managed release, it takes precedence over `data/wiki-v2`. Use the checked installer for subsequent updates. An explicit `WOSB_WIKI_DIR` overrides both and disables managed installation from the dashboard.

## GitHub installation

The dashboard administrator's **Update wiki** tool downloads one verified part at a time from:

`https://github.com/ajtchess-code/bom/releases/download/RELEASE_TAG/release.json`

Publish `release.json` and all 54 ZIPs as assets of the **same public GitHub release**, then enter its tag in the dashboard. The manifest's release ID and the GitHub tag need not be identical. Keep the page open until installation finishes. If interrupted, use the same tag to resume; completed parts are recorded. Active data changes only after every part verifies. No GitHub token is exposed in the dashboard.

The installer updates game data/images only. Install source-code changes through the normal bot deployment first. GitHub assets have not been uploaded by this local build; the connected GitHub tool can publish source changes but does not expose release-asset upload, and the available browser is not signed in.

## Coverage and accuracy

This is the supplied **2026-11-10 client snapshot**, not a live game-server feed. The source records 72 image-decode failures and 73 extraction issues; those categories overlap. Some failed decode attempts are not Texture2D images. The ZIP indexes match the expanded folder after removing the handoff ZIP's top-level directory; no additional files were found in either ZIP.

Current listings, stock, ownership, active spawns, player/port/event modifiers and missing quantities are not invented. Price bounds are not current prices. Code constants and reward lists are not verified drop rates. Golden Lantern's descriptive name and its raw ball-damage bonus disagree; both remain visible. Technical evidence is labeled separately from evaluated game facts.

Legacy knowledge tables, feedback/history and guild guides are retained for other bot tools and compatibility. The replacement does not purge the live database. The old wiki's reference interfaces are retired; this avoids destroying unrelated guild content, audit history or ship-builder dependencies.

## Validation

- API, controller and dashboard TypeScript checks.
- Production builds of the API, controller and dashboard.
- Nine tests covering shared crafting demand, alternatives, cycles, invalid quantities, Unicode/index boundaries, permission gates, manifest limits, ZIP traversal, every source table's final page, crew localization and Discord fact selection.
- Browser checks for navigation, all nine lanterns and their numeric source fields, comparisons, crafting, all 84 ship nodes, successful loading of every ship image, and mobile horizontal containment.
- Full checked installation of all 54 final ZIPs into a local release directory.

Production Discord delivery, Novonode network access, host disk capacity and the GitHub remote-install path still need verification on the actual host. The offline installer has been exercised locally.

## Rebuilding a future data release

From the bot repository, with an expanded handoff folder available:

```text
python scripts/build-game-wiki.py --source PATH_TO_HANDOFF --destination data/wiki-v2-NEW --packages wiki-releases/NEW
```

Use a new destination for each release. The compiler validates table row counts and image presence, writes byte-offset indexes, and refuses any oversized upload part. It requires Python only on the build computer; the host installer uses Node's built-in libraries.

```text
WIKI_DATA_TEST=1 node --import tsx --test scripts/tests/game-wiki-v2.test.mjs
node scripts/tests/game-wiki-browser.mjs
```

On Windows PowerShell, set the test variable with `$env:WIKI_DATA_TEST='1'` first. The browser check uses a local Chrome/Edge installation or an installed Playwright Chromium and starts local preview servers. Preview routes live in the separate `test-preview` app and are not production routes.
