# Sea Battle Compendium on bandofmisfits.org

The public wiki is now the **Sea Battle Compendium**, built from the game client by WoSB Workbench. It replaces the old encyclopedia at the site root, and keeps the BOM header, member login, AdSense slots and the PayPal donation footer.

## What visitors get

- Every ship, cannon, ammo, upgrade, crew, skill, resource, port, cosmetic, recipe and mission page.
- The in-game style **shipyard** on the Ships page.
- The **interactive world map**: the game's own map with named ports, port-battle sites, towers, forts, villages, resource nodes and trade routes. Drag, zoom and search are supported.
- Tools: hit analysis, towers/forts/mortars, fire calculator, damage simulator, wind & sailing, ship comparison, hitbox viewer, and the battle and boarding simulators.
- Battle Prep stays at `/prep`.

## Publishing a new build

1. In the dashboard, open **Wiki → Officer Tools → Compendium** and click **Create upload token**. Copy the token; it is shown once.
2. In WoSB Workbench, run **Build wiki website**, then **Publish wiki to Band of Misfits** and paste the token when asked. It is remembered afterwards.
3. The Workbench uploads the site in checked ZIP parts (each under 40 MB, with SHA-256 and CRC checks). The new release goes live only after every part has arrived intact.

The token can also be set as `COMPENDIUM_UPLOAD_TOKEN` in `.env`. The same panel can upload ZIP parts by hand and switch back to the previous release. One earlier release is kept on disk.

Releases are stored in `data/compendium/releases/`, and the live one is recorded in `data/compendium-active.json`. Both are git-ignored.

Until the first release is installed, visitors still see the old encyclopedia. After that, `/wiki` redirects to the Compendium.

## Discord commands

| Command | What it does |
|---|---|
| `/ship ship [gun]` | Stats, a where-to-hit-it heatmap image, the best ammo against the ship and the fire threshold, with links |
| `/damage gun target [ammo] [from]` | Damage per ball from any angle, the zone it hits, the glancing limit and the dead zone |
| `/fire ship [hp] [suppression]` | Minor fires needed for a large fire, burn times, and whether a check can run at that HP |
| `/tower rank team [port_level]` | Tower and guild-fort HP, tower reach and capture rules |
| `/compendium query` | Search the Compendium |

The commands read the live release on disk. Publishing a new build updates them with no restart. Links use `PUBLIC_WIKI_URL` (default `https://bandofmisfits.org`). Pasted Compendium links get Discord previews from the pages' OpenGraph tags.

## Tests

`yarn test:compendium` covers part upload and verification, activation, path safety and the injected chrome.
