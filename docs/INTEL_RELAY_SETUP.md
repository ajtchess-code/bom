# BOM root installation + Intel Relay

Prepared against the supplied **BOM-Bot-v4.1.1-Fresh-Install-No-Env.zip**. The archive is a root overlay: extract directly into the directory that already contains the BOM `package.json`, `apps/`, `packages/` and `scripts/`.

## What changes

- Replaces `scripts/novonode.mjs` with the supplied v4.1.1 launcher plus optional relay integration and shutdown grace.
- Adds `scripts/intel-relay.mjs` and its tests.
- Adds the complete relay in `intel-relay/`, including its own package lock, dependencies, configuration example and SQLite storage location.
- Adds this setup guide.
- Does **not** include a real `.env`, tokens, database files, root `package.json`, root workspace changes or Cloudflare credentials.

The existing API, controller, workers, dashboard, PostgreSQL/Redis configuration and Cloudflare process retain their setup. The relay is not added to the Yarn workspaces and does not share their node_modules.

## 1. Upload

1. Stop the host.
2. Back up the current `scripts/novonode.mjs`.
3. Extract **BOM-Intel-Relay-Root-Overlay.zip** directly into the existing host root. Do not create an extra outer folder around the overlay.
4. Confirm these paths exist:

| Path relative to host root | Purpose |
| --- | --- |
| `scripts/novonode.mjs` | Existing supervisor, now also launches relay |
| `scripts/intel-relay.mjs` | Relay installation/configuration helper |
| `intel-relay/package.json` | Separate relay package |
| `intel-relay/.env.example` | Relay settings template |
| `intel-relay/src/dashboard/index.html` | Terminal-style interface |

## 2. Runtime and password

Select **Node.js 24.0 or newer** in the host panel. The root bot previously allowed Node 20.9+, but the relay uses built-in SQLite and has a higher requirement. The root Dockerfile's Node 22 image is not upgraded by this overlay; these instructions target your existing panel/root installation, not that Docker setup. If the runtime is too old, the relay is skipped with an explanation while the existing bot continues.

Copy `intel-relay/.env.example` to **`intel-relay/.env`**, then fill in:

```dotenv
DASHBOARD_PASSWORD=REPLACE_WITH_A_UNIQUE_PASSWORD_OF_AT_LEAST_16_CHARACTERS
DASHBOARD_HOST=127.0.0.1
DASHBOARD_PORT=8196
PUBLIC_ORIGIN=https://intel.bandofmisfits.org
COOKIE_SECURE=true
DATA_DIR=./data
LOG_LEVEL=info
```

Do not put these values in the root bot's `.env`. Both applications use `DASHBOARD_PORT`; the integration deliberately keeps them separate. Preserve the root bot's existing values.

No root enable flag is necessary: the supervisor starts the relay when its folder and `.env` are present. To disable it later, add `INTEL_RELAY_ENABLED=false` to the root `.env` or host environment.

Port 8196 is the proposed private origin port. The launcher rejects conflicts with the configured BOM dashboard, API and local Redis ports. If another service uses 8196, choose a different relay port and change the Cloudflare route to match.

## 3. Existing startup command

Keep your current root entrypoint if it runs `scripts/bootstrap.mjs` or `scripts/novonode.mjs`. The supplied codebase documents:

```sh
npm run start:host
```

Equivalent bootstrap entrypoint:

```sh
node scripts/bootstrap.mjs
```

On restart the helper installs dependencies in `intel-relay/node_modules` using its own lockfile when needed and builds relay TypeScript. It then launches the compiled relay with `intel-relay/` as its working directory and an isolated environment. Your root Yarn installation and bot credentials are not passed into the relay process. The existing supervisor restarts a crashed relay. No second terminal, background `&` command or process manager is required.

A missing/invalid relay configuration is logged and does not block the root bot. Both services share the allocation's CPU and memory. Keep enough RAM available for the existing Next.js build and the additional running Node process. The host must allow the additional process and a Node 24 runtime.

## 4. Add the Cloudflare route

The supplied root supervisor already starts a token-managed `cloudflared` connector. Reuse that tunnel. In Cloudflare, open the existing tunnel and add a **published application route / public hostname**:

| Field | Value |
| --- | --- |
| Subdomain | `intel` |
| Domain | `bandofmisfits.org` |
| Path | Leave blank |
| Service type | `HTTP` |
| Service URL | `127.0.0.1:8196` |
| Public URL | `https://intel.bandofmisfits.org` |

Preserve all other existing routes. Ensure DNS for `intel` points to this tunnel; the published route workflow normally creates its DNS record. If `intel` already has a conflicting DNS record, resolve that conflict rather than changing the existing bot's hostname.

The local service is **HTTP**, even though visitors use **HTTPS**. Cloudflare provides the public HTTPS endpoint; the local HTTP hop stays inside the same host/container. No public allocation for port 8196 is normally needed when `cloudflared` runs in the same network namespace. Do not expose it as a public unencrypted admin port.

This localhost route assumes the connector is the one launched inside the same allocation by the provided supervisor. If the connector runs in a different container/machine, localhost refers to that connector; use an address it can actually reach and adjust the relay bind address accordingly.

This package does not create or change Cloudflare routes/DNS remotely. No second connector or tunnel token is included. The old local `deploy/cloudflared-config.example.yml` is not used by this token-managed tunnel; editing that example alone will not publish the hostname.

## 5. Verify

Expected host messages include:

```text
[intel] Installing isolated relay dependencies...
[intel] Building relay from current source...
[startup] intel-relay started (pid ...)
[intel] Dashboard configured for https://intel.bandofmisfits.org -> http://127.0.0.1:8196
```

Open **https://intel.bandofmisfits.org**, sign in using the password from `intel-relay/.env`, add a user account and webhook, and choose source channels.

From inside the same host, `http://127.0.0.1:8196/healthz` returns only `{ "ok": true }`. Use the HTTPS public hostname for browser login: secure cookies and origin checks are configured for that hostname. Confirm both the existing BOM dashboard and the new Intel dashboard still work.

If Cloudflare returns 502, check that `intel-relay` started, the service is HTTP on 8196, and the connector is in the same host/container. A 403 on login usually indicates the browser origin does not match `PUBLIC_ORIGIN`. A password/configuration failure is logged locally without printing secrets.

## Backups / rollback

Keep `intel-relay/data/accounts.enc`, `intel-relay/data/accounts.key` and the SQLite files together in backups. Existing root data is separate.

To roll back, stop the host, restore the backed-up `scripts/novonode.mjs`, and restart with the original startup command. The added relay folder can remain without being launched. Do not delete its data if you want to retain the account configuration.

## Validation and limits

Relay strict build and 20 tests passed, including public-origin checks and secure cookies behind a proxy. Five host-helper tests passed, covering environment isolation, port conflicts, optional startup and relay-only install/build commands. Root startup scripts passed syntax checks.

The complete BOM deployment was not launched: its PostgreSQL, Discord, Lavalink and Cloudflare credentials were not supplied. Host dependency installation, actual Node runtime compatibility of the existing bot, DNS/tunnel routing and live Discord delivery still require verification on your host. The upstream user-client dependency is archived. Browser visual rendering remains unverified.

Cloudflare reference: https://developers.cloudflare.com/tunnel/concepts/routing/


## Intel 3.1.0 — destination boundary and operations

The integrated launcher passes the existing root `DISCORD_GUILD_ID` as `DESTINATION_GUILD_IDS`; root secrets remain isolated from the source process. Standalone installations must set `DESTINATION_GUILD_IDS` explicitly. Before every destination write, the webhook must resolve to an approved BOM guild and must not be in the monitored source-guild set. Source-account REST writes are always rejected independently of destination configuration.

Use the **Intel operations** panel after selecting an account. Select Primary or a sub-relay, review exclusions with **Preview monitored channels**, then review and apply the rules. **Check access** performs reads only; the report preview is local and does not send a test message.

The relay automatically creates its new SQLite archive, delivery and configuration-history tables. Existing mappings and encrypted account credentials are retained. Do not delete `intel-relay/data`, `accounts.key`, `accounts.enc` or SQLite files when applying the update. Configuration history credentials are separately encrypted in `config-history.enc` using the existing account key. Structured history begins with newly observed events after installation.
