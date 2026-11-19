# Updating the bot from GitHub on launch

From this update on, the bot host doesn't need zip uploads to get new versions. On every start, `index.js` does the following:

1. **Checks GitHub** for the newest commit on `main` of `ajtchess-code/bom`.
2. **Downloads it if it's new**, unpacks it into a staging folder and checks it arrived complete. Only then does it copy it over the install.
3. **Leaves your own files alone.** It never touches:
   - `.env`, `node_modules` and `build-tmp`;
   - the live data: `data/compendium*`, `data/*-active.json`, `data/redis`, `data/pb-art` and the wiki release folders;
   - Cloudflare files;
   - anything that isn't in the repository.
   Files that an earlier sync installed and the new commit no longer has are removed.
4. **Installs and builds as usual.** If `package.json` changed, it reinstalls dependencies, then builds.
5. **Rolls back a failed build.** If the new code doesn't build, the previous files are put back and built instead, so the bot still comes up. That commit is then skipped until a newer one is pushed (set `BOM_REPO_FORCE=1` to retry it).

If GitHub can't be reached, the bot starts with what's already installed.

## Settings (`.env` or the host panel)

| Setting | Default | |
|---|---|---|
| `BOM_REPO_SYNC` | `on` | `off` disables the pull, for example while testing a hand-uploaded build |
| `BOM_REPO` | `ajtchess-code/bom` | |
| `BOM_REPO_REF` | `main` | A branch, tag or commit |
| `GITHUB_TOKEN` | — | Only needed for a private repository, or to avoid GitHub's anonymous limit of 60 checks an hour |
| `BOM_REPO_FORCE` | — | `1` re-pulls even when the commit hasn't changed |

The installed commit is recorded in `.bom-repo-sync.json`. Startup logs show `[repo-sync] up to date …` or `[repo-sync] updating abc1234 → def5678 …`.

## One-time setup

Upload `BOM-Bot-auto-update.zip` to the server's root folder (`/home/container`), unzip it there so the files overwrite the old ones, then restart. That zip contains `index.js`, `scripts/repo-sync.mjs`, `scripts/bootstrap.mjs` and this page. The first start downloads the full source, about 60 MB, and does a full build, which takes a few minutes. Later starts only download when something new was pushed.
