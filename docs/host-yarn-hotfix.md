# Novonode installer hotfix

The panel executes `pnpm dlx yarn install`, selecting Yarn 4.18.1, before running the selected bot startup file. The provided diagnostics show a 100 MB `/tmp` tmpfs even though `/home/container` has ample free space and inodes. The log identifies a failure while Yarn 4 converts an archive to ZIP; the small temporary mount is the likely constraint, rather than the bot's main disk.

This patch uses Yarn's supported `yarnPath` setting in `.yarnrc.yml` to launch the dependency-free `scripts/yarn-host.cjs` wrapper before the modern installer runs. It selects an available Yarn Classic 1.x binary (global Yarn first, then Corepack, then pinned npx fallback), rejects Yarn 2+, and directs child TMPDIR/TMP/TEMP to `build-tmp` under the bot root. Install includes dev dependencies needed for the production build. YARN_IGNORE_PATH prevents recursive forwarding. Nonzero install exits propagate normally. The bot bootstrap also uses the larger temporary directory for later builds and children; its internal resolver now rejects modern Yarn candidates.

## Upload

1. Stop the server in the hosting panel.
2. Extract the hotfix ZIP directly into the existing bot root, overwriting included files. Ensure `.yarnrc.yml` is extracted too.
3. Restore the panel startup file to `index.js` if it is still set to the diagnostic script. Keep SKIP_STARTUP_BUILD unset or false.
4. Start normally. No server reinstall, manual shell install or panel command edit is required for the logged `pnpm dlx yarn install` command, provided the host honors project Yarn configuration.
5. Look for `[host-yarn] Using Yarn 1.22.22; temporary files: /home/container/build-tmp` before installation.

The wrapper can use another directory via BOM_BUILD_TMP_DIR if the host provides that variable before install. Existing cache/data/dependency files are not deleted. No environment secrets are included. If the host forces YARN_IGNORE_PATH=true before its first Yarn command or replaces the project configuration, the redirect is bypassed and provider intervention is still required. The initial `pnpm dlx` package download precedes Yarn's project redirect; the observed error was inside Yarn's later fetch/ZIP phase.

This patch also handles Discord Unknown Channel (10003) during application startup restoration: active review/interview applications whose saved ticket no longer exists are deleted as abandoned, as requested. A guarded single SQL statement removes any dependent completion job and then the application, cascading to its application events/interviews/feedback. The guild, application ID, channel ID and active status must still match at deletion time. Accepted/declined/completed applications are not selected. Permission and transient Discord errors still log warnings without deleting anything.

Validation: four wrapper tests and three application recovery tests; a direct integration check with the actual Yarn 4.18.1 CLI confirmed project redirection before install (Classic child mocked to avoid altering dependencies). Controller compilation and the existing feature regression tests are also run. These checks do not execute against the live host.
