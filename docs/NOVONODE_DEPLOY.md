# Novonode deployment guide

This deployment path is designed for Novonode Discord bot hosting with a Novonode-managed PostgreSQL database and a Cloudflare Tunnel in front of the dashboard.

## 1. Confirm how many Discord bot identities your package permits

The music architecture supports one Controller plus up to eight voice workers. `WORKER_COUNT` can be 1-8 and missing worker tokens are skipped safely.

Novonode's current public product page advertises multi-bot capacity on some plans, while its current Terms contain a one-bot-per-package rule. Confirm the policy applicable to your account with Novonode before enabling multiple Discord application identities in one package.

If only one identity is permitted, the code can start with one worker, but the Controller is a separate identity by design. In that case use separate allowed allocations/packages, or ask Novonode which deployment arrangement they permit. Do not try to hide extra bot processes from the host.

## 2. Provision PostgreSQL

Create a PostgreSQL database in the Novonode panel. Collect the host, port, database name, username and password.

The application can use either:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
```

or:

```env
POSTGRES_HOST=
POSTGRES_PORT=5432
POSTGRES_DATABASE=
POSTGRES_USER=
POSTGRES_PASSWORD=
```

If Novonode requires TLS for the database connection, also set:

```env
POSTGRES_SSL=true
```

Do not expose PostgreSQL through the Cloudflare public hostname.

## 3. Create Discord applications

Create one Controller application and as many worker applications as your host/package permits, up to eight.

Controller/single-guild environment values:

```env
DISCORD_GUILD_ID=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_TOKEN=
```

Worker values:

```env
WORKER_COUNT=8
WORKER_1_TOKEN=
WORKER_2_TOKEN=
WORKER_3_TOKEN=
WORKER_4_TOKEN=
WORKER_5_TOKEN=
WORKER_6_TOKEN=
WORKER_7_TOKEN=
WORKER_8_TOKEN=
```

If only four workers are enabled, set `WORKER_COUNT=4`; there is no need to edit source code.

On the Controller application enable the privileged intents required for Server Members and Message Content. Configure its OAuth redirect URI as:

```text
https://music.example.com/api/auth/discord/callback
```

Replace the hostname with the exact Cloudflare hostname you intend to publish.

## 4. Configure Lavalink

Set:

```env
LAVALINK_URL=HOST:PORT
LAVALINK_PASSWORD=
LAVALINK_SECURE=false
LAVALINK_SEARCH_PREFIX=ytmsearch:
```

If Lavalink is behind TLS, set `LAVALINK_SECURE=true`.

Install/configure LavaSrc on the Lavalink server for the external music sources you want to resolve. Install/configure LavaLyrics if you want timed live lyrics. The Discord bot should not contain provider secrets that belong to Lavalink.

## 5. Configure application secrets

Set the public dashboard origin and two independent high-entropy secrets:

```env
NODE_ENV=production
PUBLIC_DASHBOARD_URL=https://music.example.com
INTERNAL_API_URL=http://127.0.0.1:4100
SESSION_SECRET=<64+ random characters>
INTERNAL_API_TOKEN=<a separate long random value>
```

The hostname must exactly match the origin used by the browser because the dashboard proxy rejects cross-origin mutation requests.

## 6. Redis choice

If you have a reachable Redis service, set:

```env
REDIS_URL=redis://HOST:6379
```

If not, leave `REDIS_URL=` blank. The project falls back to its PostgreSQL `live_*` tables for live queues, votes, leases, streams and ephemeral schedules.

Redis is preferred once services are split between hosts or the installation becomes high traffic, but it is not required to boot this Novonode package.

## 7. Upload the project

Upload the entire project folder using Novonode's file manager or SFTP. Do **not** upload a real `.env` publicly or commit it to a public repository.

Use a Node.js runtime meeting the repository `engines` requirement (Node 20.9+). The Docker image uses Node 22, but Docker is not required for the Novonode path.

Set the startup command to:

```bash
npm run start:host
```

On a clean installation this command:

1. installs npm workspace dependencies if `node_modules` is absent;
2. builds the TypeScript packages/apps and the Next.js production bundle if outputs are absent;
3. applies the PostgreSQL migration;
4. starts the internal API;
5. starts the Controller;
6. starts each configured worker;
7. starts the Next.js dashboard;
8. optionally starts `cloudflared` if both tunnel variables are configured;
9. restarts an individual child service if it crashes.

To force a rebuild after replacing source files, set `FORCE_BUILD=1` for one startup, then remove it afterward.

## 8. Cloudflare Tunnel

The dashboard listens on `DASHBOARD_PORT` (default 3000). The private API listens on localhost port 4100 by default.

Create a remotely managed Cloudflare Tunnel and publish a route such as:

```text
music.example.com  ->  http://127.0.0.1:3000
```

If Novonode lets you run a `cloudflared` executable in the allocation, set:

```env
CLOUDFLARE_TUNNEL_TOKEN=
CLOUDFLARED_PATH=/home/container/cloudflared
```

The supervisor launches `cloudflared tunnel --no-autoupdate run` with `TUNNEL_TOKEN` in its environment.

If the host does not permit the connector binary/network arrangement, run Cloudflare Tunnel somewhere that can reach the dashboard origin. Do not point a public Cloudflare route directly at PostgreSQL, Redis or port 4100.

## 9. First start

Watch the startup console. A healthy boot should show:

```text
[startup] api started
[startup] controller started
[startup] worker-1 started
...
[startup] dashboard started
[startup] BOM-Bot online ...
```

The migration is idempotent (`CREATE TABLE IF NOT EXISTS`) and runs before the applications start.

When the Controller reaches the configured Discord guild, it creates the default guild settings row if needed. Then:

1. open the dashboard through Cloudflare;
2. sign in with Discord;
3. create a Music Room with a request channel and voice channel;
4. configure role permissions and skip mode;
5. type a song/search/URL into the request channel or open `/music`.

## 10. Useful environment controls

```env
WORKER_COUNT=8
DASHBOARD_PORT=3000
API_PORT=4100
POSTGRES_POOL_SIZE=12
POSTGRES_SSL=false
LAVASRC_ENABLED=true
LAVALYRICS_ENABLED=true
LASTFM_API_KEY=
MUSICBRAINZ_CONTACT=admin@example.com
```

`DISCORD_GUILD_ID` is mandatory in this build. The Controller, private API authorization, dashboard membership checks, and all music workers are intentionally scoped to that one guild.

## Behavior to expect

- One worker handles one active room at a time.
- Worker presence shows the track for the worker's currently assigned room.
- A maximum of eight rooms can play simultaneously with eight configured workers.
- Room queues are centralized, so Discord and the dashboard see the same queue.
- Private Discord panels delete after 90 seconds with no interaction; an interaction renews the inactivity window.
- Public Now Playing cards are removed when the track ends; the room Controller card persists/repositions.
- If a worker or source fails fatally, the lease is released and the next explicitly queued track can be tried without creating an autoplay retry loop.

## Troubleshooting

**Dashboard login succeeds but no music rooms appear:** confirm the Controller is in `DISCORD_GUILD_ID`, then create the first Music Room from the dashboard. This build has no guild picker.

**Login loops:** verify `PUBLIC_DASHBOARD_URL` and the Discord OAuth redirect URI match exactly, including `https` and hostname.

**No audio:** check worker tokens, worker invite permissions, Lavalink reachability/password, and that at least one worker heartbeat appears in the dashboard.

**Spotify/Apple/Tidal link resolves incorrectly:** this is usually a LavaSrc/source-provider configuration issue on Lavalink, not a dashboard OAuth issue.

**Lyrics unavailable:** confirm LavaLyrics is installed/enabled and the resolved track/provider returns timed lyrics.

**PostgreSQL works but dashboard feels slow:** add Redis and set `REDIS_URL`; the PostgreSQL fallback prioritizes compatibility over high-throughput real-time performance.

## Single-guild and Discord audio-quality defaults

This build is intentionally single-guild. `DISCORD_GUILD_ID` is mandatory. The dashboard has no guild picker, API routes do not accept a guild ID, the Controller registers slash commands only in that guild, and Controller/worker bots leave or ignore any other guild.

For a fully boosted (Tier 3) Discord server, set:

```env
VOICE_BITRATE_TARGET=384000
ENFORCE_VOICE_CHANNEL_BITRATE=true
EPHEMERAL_IDLE_SECONDS=90
```

Discord currently documents 384 kbps as the Tier 3 voice-channel cap. The Controller clamps the requested target to the guild's actual tier cap and attempts to set each configured music voice channel when playback starts. Give the Controller **Manage Channels** if you want this enforcement to happen automatically. If that permission is omitted, manually set each music voice channel to the maximum bitrate in Discord.

The worker joins voice self-deafened and does not add a local transcoding/mixing stage. The default room filter is `flat`; DSP presets are applied only when explicitly selected. For highest-fidelity normal playback, keep the default filter flat and avoid gain/EQ effects unless they are wanted for the listening experience.

## Local Redis on Novonode

BOM-Bot supports a no-root local Redis bootstrap for Novonode's Alpine Node image.
On the tested Novonode image (Alpine 3.22.x, x86_64), the launcher:

1. Detects the running Alpine branch and architecture.
2. Uses `apk search -x redis` only to discover the exact official package version.
3. Downloads that `.apk` directly from `dl-cdn.alpinelinux.org` with `curl`.
4. Extracts it under `/home/container/vendor/redis/root` without system installation.
5. Generates `/home/container/config/redis-password.txt` if it does not exist.
6. Generates a loopback-only Redis config and stores persistence under `/home/container/data/redis`.
7. Starts Redis on `127.0.0.1:6379`, waits for `PONG`, then injects `REDIS_URL` into all BOM-Bot child processes.

Set these values in `.env`:

```env
REDIS_URL=
LOCAL_REDIS_ENABLED=true
LOCAL_REDIS_PORT=6379
LOCAL_REDIS_MAXMEMORY_MB=256
```

Do not allocate public port 6379 and do not publish Redis through Cloudflare.
If `REDIS_URL` is set manually, the local bootstrap is skipped. If
`LOCAL_REDIS_ENABLED=false` and `REDIS_URL` is blank, BOM-Bot uses the PostgreSQL
live-state fallback.

Redis may print a `vm.overcommit_memory` warning inside managed containers.
The setting is controlled by the host kernel and normally cannot be changed by
the bot user. For BOM-Bot's small single-guild workload this warning is not a
startup failure; the launcher relies on the Redis PING health check instead.
