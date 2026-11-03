# Clash toolkit third-party notices

## Game catalog

Source: https://github.com/chiefpansancolt/clash-of-clans-data

Pinned commit: `54cec2a31fd68e538d8e8074388d2d04db6d43c9`, package version 0.18.1, retrieved 2026-10-21.

Copyright (c) 2026 Christopher Pezza. MIT License. Full license: `third_party/clash-of-clans-data/LICENSE`.

`data/clash/catalog.json` contains normalized facts from the project's JSON data: 225 entries and 3,177 levels spanning Home Village, Builder Base and Clan Capital. Transform script: `scripts/import-clash-catalog.py`. No images are copied. To refresh, check out the upstream repository at the intended reviewed commit, run `python3 scripts/import-clash-catalog.py /path/to/checkout`, review changes and run toolkit tests. The importer records the checked-out commit; update its package version/retrieval metadata if changing releases.

## Potion calculator

Source: https://github.com/LukasMFR/clash-potion-calculator

Pinned commit: `352eeafa35cf2b7dca4456f1cac1bc31af89b86b`.

Copyright (c) 2025 Lukas MAUFFRÉ. MIT License. Full license and original files: `third_party/clash-potion-calculator/`.

The potion coverage formula in `packages/shared/src/clashToolkit.ts` is adapted from this project: ten-times builder speed and twenty-four-times research/pet speed, accounting for remaining time shorter than potion coverage. The dashboard interface, scheduler, collaboration tools and clan workflows are BOM implementations.

## Game ownership

Clash of Clans is a Supercell game. This community toolkit is unofficial, is not endorsed by Supercell, and does not execute gameplay. Game data and balance can change after the pinned snapshot. Users supply their own base screenshots and shared links.
