# v4.3.7a startup recovery

The supplied log contains two independent failures:

1. The host runs `pnpm dlx yarn install`, which selected Yarn 4.18.1. Its dependency fetch failed with `ENOSPC: no space left on device`. This can mean the server's disk quota, filesystem space, or inode allowance is exhausted. The log does not identify the largest files.
2. Startup continued using Yarn 1.22.22 and the existing dependencies, but controller compilation stopped because `apps/controller/src/clashToolReminders.ts` was absent.

The v4.3.7 overlay assumed the complete October 22 source tree, where this module already existed. Your installed tree lacks it. This corrected cumulative overlay includes it and the transitive local source dependencies of the changed modules, plus database migrations. It contains all v4.3.7 changes. No environment files or credentials are included.

## Recovery steps

1. Stop the server and its restart loop.
2. In the hosting panel, replace the install/pre-start command `pnpm dlx yarn install` with `yarn install --non-interactive`. Your log confirms the host's `yarn` command is already Yarn 1.22.22. Check with `yarn --version`. Avoid unversioned `pnpm dlx yarn`, which selected a different major version.
3. Check your panel's disk quota. If you have a console, run `df -h /home/container` and `df -i /home/container`. Review `du -sh /home/container/.yarn /home/container/.cache /home/container/.local/share/pnpm /home/container/node_modules` where those folders exist. Provider quotas may be full even when the host filesystem shows free space.
4. Free space by downloading/removing obsolete source ZIPs, old backups and failed-install package caches through the file manager. Stop processes before removing caches. Preserve `.env`, PostgreSQL/Redis storage, persistent game data, uploads and required live assets. Do not delete the project or its data directory. If you cannot free enough space for dependencies and a Next.js build, increase the disk quota. This ZIP cannot change your host's quota.
5. Extract this ZIP into the existing project root, overwriting matching files. Preserve your `.env`. Do not replace the whole project directory with this overlay.
6. Run `yarn --version` (expect 1.22.22), then `yarn install --non-interactive`. Do not continue after an install error. The root package manifest restores the project's Yarn 1 pin.
7. Run `yarn migrate`, then `yarn build`. After both succeed, start through your existing `startup-next-fix.cjs`/`index.js` host entry point. No replacement for your host-specific startup wrapper is required.

The missing-file error is addressed by this package. The disk-full condition and hosting-panel pre-start command require action on the host. There is no evidence of an out-of-memory crash in this log. The peer-dependency/license warnings are not the fatal failures shown here.

## Validation

- Controller TypeScript build passed with the restored module.
- The packaging dependency walk found no unresolved relative or @bom source imports among the included modules.
- The archive includes the v4.3.7 overlay, the missing module, its local source dependencies and SQL migrations; checksums are included.
- Live disk space, install completion and Discord startup cannot be verified from this workspace.

See docs/INSTALL-v4.3.7.md for feature configuration after recovery.
