# Wiki planners and recovered chest rules

Built against repository main `eb192a4`, preserving its world atlas, dashboard theme and other bot changes. Install this code over the current codebase; keep the existing `wiki-2026-11-10` data release. No new 54-part data download is required.

## Tools added or expanded

- **Combat lab:** ship/weapon/ammunition choices for up to six gun banks, equipment armor/HP effects, consumable descriptions and a separate temporary durability buffer. Compare single-gun discharges with full-bank volleys. Bow, side and stern impact are explicit scenarios, not fabricated damage multipliers.
- **Range lab:** editable ship positions/headings, bow/stern/broadside banks, range bonuses and sectors, mortar minimum ranges, and a vertically stacked comparison of all 42 weapon records. Multiple banks can occupy the same position to represent one ship. Gun numbers, slots and sectors are scenario inputs; extracted gun-port layouts are not enforced.
- **Crafting:** location filters and an active Guild Furnace Rental toggle. The API also excludes unavailable guild recipes and intermediate choices. Personal Island Labor and port crafting time are shown separately, preserving original source work values.
- **Personal Islands:** up to three independent plans, building-order/rank construction costs, all 48 decoration designs, gold-only guild decoration discount, per-island and combined costs/materials, population/Labor limits and selected benefits. Island unlock skill costs are separate.
- **Crafting time:** up to 11 warehouse slots, user-confirmed dangerous-water ports, Secret Hall second workshops, all workshops counted toward Workforce Management, guild benefits, Hired Miners, Crew Figurines and Hispaniola Shipwrecks collections, and recovery-to-full estimates.
- **Resource Nodes:** subscription, captives, Rations/Self-Supply, Logistician, dangerous-water skill, guild production and warehouse settings. Shows working-speed comparisons and storage. Optional observed base rate enables explicitly conditional fill-time estimates. Source world-node placement candidates have a map and counts by model; arena records are excluded.
- **Special crew:** 51 specialists with exact English names, images, four source classes, acquisition guidance and island recruitment Labor/captive budgeting. Account-dependent individual recruitment percentages remain unknown.
- **Chest simulator:** Large, Treasure of the Incas and Elite baseline presets, normalized percentages, expected category counts and random rolls, plus custom odds. Large has 41 weighted entries; Incan has five groups; Elite has nine groups. Some groups contain multiple different items; group sampling does not resolve those items or quantities.

## Newly recovered evidence

The existing exporter selected methods by readable class names and omitted two obfuscated chest initializer classes. The original local installation's `Common.dll` matches the export's SHA-256:

`3fbe9d5a8199be8e95c449d4f4a981221c823cec70381c709d57c165888fca82`

Static IL was read as data, without loading or executing game assemblies. The Large Chest initializer is `A.r::.cctor` (0x06002f5e); Incan is `A.S::.cctor` (0x06002fba). Their raw totals are about 1,016.15 and 100 respectively. Raw weights are normalized for the independent baseline sampler. They are **not** universal live account probabilities: first-opening guarantees, eligibility, owned ships, pity/assurance counters and server changes are excluded.

Recovered crafting methods establish:

```
limit = truncate((skill base limit + workshop bonus + guild limit
                  + 50 if Crew Figurines completed + other selected flat limit)
                 × subscription multiplier)
recovery/hour = skill base recovery × subscription multiplier
                + guild recovery + 5 if Hispaniola Shipwrecks completed
```

The subscription multiplier is 1.5 when Hired Miners is active. Skill bases are 300/30, 600/40 and 1000/50. `CountWorkshops` sums every opened workshop, including two in one port. Dangerous-water membership remains a user-confirmed input rather than an inferred current port classification.

`docs/wiki-evidence/manifest.json` records recovered methods and hashes. `scripts/recover-wiki-planner-rules.py` reproduces the added chest snapshot with the original catalog tool's metadata reader and rejects a different assembly hash. The API checks the installed export's assembly hash before enabling these snapshot-specific planners.

## Limits that remain

- No exact HP damage, DPS or stern-raking simulation: per-ship collision geometry, internal penetration paths and the complete impact pipeline are not decoded. Ship shapes are clearly schematic.
- No automatic gun-slot legality, payload choice for special weapons, or rank-column inference. Removed ammunition is excluded; ordinary cannon/mortar families are filtered. Swivel weapon definitions are not present in the 42-weapon collection.
- Equipment stacking, slots, conditional consumable behavior, temporary HP stacking/duration and live modifiers are not enforced. Manual scenarios are not automatically legal game builds.
- No universal node hourly base rate. Farms also require animal-stock interpretation. Source storage units must be checked against actual output units before using a fill estimate.
- World node counts are placed model candidates, not a complete census of runtime/server-generated nodes. Map calibration remains approximate.
- No verified individual special-crew odds or full chest guarantee/account simulation.
- Island costs are known-price subtotals. Unpriced/event decorations, unlocks and material market valuations remain separate; geometric placement and undocumented buildings need in-game verification.

## Validation and host installation

Planner and prior refinement tests pass, including subscription stacking order, ration failure, integer building costs, warehouse allocation, ammo families, recipe access, weighted sampling and recovered chest/crew records. Browser checks cover every new page, all three presets, guild recipe API gating, key calculations and mobile width. API/shared/dashboard type checks and production builds were run.

The host overlay is below 50 MB and contains code, map reference assets and evidence. Extract it at the bot project root, replacing matching files. Use the existing host build/start process to rebuild shared, API and dashboard code, then restart. Do not extract it inside `data/wiki-v2`; no source game assemblies or secret settings are included. Host installation remains a user action.
