# v4.3.8 API, shared music desk and leave recovery hotfix

This cumulative overlay includes v4.3.7 and v4.3.7a, including the previously missing Clash reminder module. It does not include environment files or credentials.

## Fixed

- New guild operations settings collided with the existing Ask/community settings at GET/PUT `/v1/community/settings`, preventing Fastify startup. Guild operations now use `/v1/community/operations/settings`; the leave dashboard uses the new URL. Ask settings keep their original URL and data. A real Fastify registration test now mounts both modules together. Operations writes also reject PB-only allied access.
- Multiple music rooms now may post their separate player panels to the same Control Desk text channel. Migration **102_shared_music_desk.sql** removes the obsolete text-channel uniqueness constraint and retains the unique guild/voice-room identity. It adds a non-unique guild/text-channel index. No music rooms or queues are deleted.
- Leave thread creation shares and caches a guild-wide member-list fetch for five minutes instead of requesting gateway member chunks for every thread. Failed member loads back off for a minute; individual thread repairs back off progressively up to five minutes. Failed repairs remain visible and recoverable.
- Music room objects are updated only after the channel change is saved successfully.

## Apply

1. Stop the server/restart loop and back up the database and current source.
2. Free disk space or increase the host quota. The install log still reports `ENOSPC`. The package cannot repair host disk allocation. Use the guidance in docs/STARTUP-RECOVERY-v4.3.7a.md to inspect disk/quota/inodes and preserve all persistent data.
3. In the panel, replace the unversioned `pnpm dlx yarn install` pre-start command with `yarn install --non-interactive`. Verify `yarn --version` is 1.22.22. The existing log showed unversioned pnpm selecting Yarn 4 despite the project's Yarn 1 setup. Do not continue after an install failure.
4. Extract this overlay into the existing project root, overwriting matching files and preserving `.env` and persistent data. It is not a standalone full installation.
5. Install dependencies successfully. Run `yarn migrate`, then `yarn build`, then restart with your existing host entry point. **Migration 102 is required**; a code-only restart will leave the music constraint error in place. The standard novonode startup also runs pending migrations before starting services.
6. Confirm the API starts on port 4100, then verify dashboard/Control Desk map requests recover and two music bots can display their individual panels in the shared channel.

The repeated ECONNREFUSED 127.0.0.1:4100 errors are consistent with the API failing during route registration. This hotfix removes the observed registration collision; if connection refusals remain after the API successfully starts, inspect the subsequent API log and configured API port.

## Host networking

The Cloudflare QUIC/port errors are independent of Fastify registration. The local startup script supports `TUNNEL_TRANSPORT_PROTOCOL=http2` in the existing environment to select HTTP/2 when UDP is unavailable. This still needs outbound **TCP port 7844**. If TCP 7844 is blocked too, ask the hosting provider to permit it. An application patch cannot open the provider firewall.

The @types/ioredis-mock peer warning is not the fatal install failure shown; ENOSPC is. No production dependency changes are required by this hotfix.

## Validation

- Controller and API TypeScript builds passed; production dashboard build passed.
- 72 targeted regression tests passed, including combined Fastify registration/settings isolation, shared-channel migration/voice uniqueness, DM mute, leave caching/backoff, permission presets, ledger, map and sticky-message behavior.
- Community API tests reran after the access guard and settings-isolation assertions were added: 8 passed.
- All 48 SQL migrations applied in an isolated PGlite database. Migration 102 separately reapplied safely with two rooms sharing a channel.
- No live deployment, host cleanup, Discord gateway operation or Cloudflare firewall change was performed.
