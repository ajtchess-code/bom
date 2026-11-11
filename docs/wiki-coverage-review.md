# Wiki coverage review — November 10, 2026

The supplied export is fully imported at the record/field level. This is not a claim that the original game is fully decoded. The host must install the data release separately from the code update.

## Checks performed

- Compared every record and field in all 77 manifest tables with `data/wiki-v2`, rather than sampling records.
- Checked all 3,829 indexed PNG files exist and their dimensions match the inventory.
- Compared extracted files with both supplied ZIP archives using file sizes and CRCs: 6,830 handoff files and six review-report files match. The handoff documentation explicitly excludes original unparsed binaries; the local `RawAssets` folder remains a separate follow-up source.
- Rechecked image resolution for 84 ships, 595 ship decorations, 48 island decorations, 79 resources, 44 ship upgrades, 55 crew entries, 42 cannons, 21 ammunition types and eight powder kegs. Every record has a resolved image reference. This includes 34 sail texture-prefix candidates, which remain marked as inferred rather than verified previews.
- Corrected mixed-scale lantern atlas coordinates and clipped crops to keep adjacent sprites outside the preview.

## Included systems that should remain easy to find

Ships and construction; upgrades; ordinary, boarding and special crew; lanterns, flags, sails and decorations; weapons and ammunition; crafting and alternative recipes; market price limits; resource-node levels; guild and port benefits; achievements and ranks; chests and explicit chance fields; NPC mission waves and categories; whales; arena and mission definitions; forts, villages, altars and other placed map objects; trade routes; wind profiles; English labels and descriptions; original schema and code evidence.

The source collection browser preserves all 77 tables, including evidence tables. Overlapping derived tables must not be summed as distinct game entities. Store-related labels and definitions are available, but they do not establish current offers, currency interpretation or stock.

## Remaining gaps and interpretation limits

| Area | Available | Still unresolved |
| --- | --- | --- |
| Images | All exported PNGs and variants | 71 font assets were rejected by the texture decoder; one sail-normal/linking asset is not recognized as XNB; one atlas grid has no per-entity cell assignments. These are the 73 recorded extraction issues, not 73 missing item pictures. |
| Ship construction | 84 construction records and material records | Some gun-port-dependent quantities need semantic model parsing. Blank quantities stay unknown. |
| NPCs | 62 NPC-eligible hulls, 21 NPC categories, 235 name entries in seven pools | Pool-to-hull assignments, server generator contents and live spawns. Name entries are not necessarily unique NPC identities. |
| Combat | Weapon/ammunition fields and verified armor calculation | Complete hit, penetration and HP-damage pipeline. The combat tool does not invent a final damage number. |
| World map | 105 ordered routes with 662 points, 42 placed ports and source objects | Fully interpreted terrain/coastline and exact image calibration. Illustrated chart alignment uses 34 legacy port anchors and is explicitly approximate. |
| Port battles | 25 existing dashboard references, including 21 illustrated maps | Current game rules, live layouts and spawn positions are not established by reference images. |
| Resource nodes | 42 level records and base upgrade schedule from hash-checked client code | Special estate/island upgrade paths, real production timing and live modifiers. Transition labels assume the code argument is the current level. |
| Market and stores | Static limits, definitions and text | Live listings, current stock, rotations and player-specific prices. |
| Models/raw assets | Inventory, preserved local binaries, model string candidates and code evidence | Decoded container payloads do not equal fully interpreted model/gameplay data. |

## Repeatable checks

Run `scripts/audit-game-wiki.py` against the export and installed data to produce the complete JSON coverage report. Run `scripts/audit-wiki-images.mjs` for record-to-image resolution. The dashboard coverage view checks actual installed image files, shows inferred matches and lists source extraction issues separately.

## Installation and host logs

Install data release `wiki-2026-11-10` through the dashboard import form, or the documented offline process. A code update alone does not install `catalog.json`. All 54 data parts are required; the importer only activates a complete release.

Missing data now produces a clear installation response instead of a generic file error. The wiki waits for the catalog before loading ship tables. The relay also guards against messages with no relayable content.

For Cloudflare QUIC failures, `TUNNEL_TRANSPORT_PROTOCOL=http2` selects TCP transport. HTTP/2 still requires outbound TCP port 7844; the host must allow that connection. This report does not claim any Novonode settings were changed.
