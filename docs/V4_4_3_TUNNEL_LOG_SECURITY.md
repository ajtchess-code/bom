# BOM v4.4.3 — Tunnel Startup Log Security

The supplied log confirms successful startup: all workspace builds completed, migration 031 applied, the controller and API started, all eight music workers became ready, and four Cloudflare tunnel connections registered. No new startup failure was shown.

However, cloudflared printed the application's `CLOUDFLARE_TUNNEL_TOKEN` environment alias without masking it. The native `TUNNEL_TOKEN` field was masked. The launcher now passes a restricted cloudflared environment containing the native token and approved runtime/network settings. Application credentials and the unmasked token aliases are not inherited. Application environment files remain unchanged.

This cumulative package includes all changes from v4.4.2 and applies over v4.3.0 through v4.4.2. Stop the server, extract at the repository root with overwrites, and restart. No new database migration is introduced.

Because the existing log contains a real token, rotate that tunnel token in Cloudflare and replace its value wherever you currently configure it (CLOUDFLARE_TUNNEL_TOKEN or your configured token file), then restart with this patch. For a token considered compromised, Cloudflare also recommends force-disconnecting existing connections. Instructions: https://developers.cloudflare.com/tunnel/reference/tunnel-tokens/ . Do not post the replacement token in logs or chat. Removing the log does not invalidate its token.

The region2 QUIC warning in this log did not prevent tunnel registration. HTTP2 prechecks passed for both regions. Redis's overcommit and UDP receive-buffer notices are host-level warnings; the log shows Redis persistence succeeded and tunnel connections registered despite them.

Validation: launcher JavaScript syntax check and all 16 repository tests passed. New tests verify that cloudflared receives its native token, keeps runtime/proxy/certificate settings, and does not inherit the aliases or unrelated bot/database/OpenAI credentials. Live cloudflared output verification requires the next host restart. This patch does not rotate credentials or change the configured tunnel transport itself.
