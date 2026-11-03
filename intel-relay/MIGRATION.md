# Migration from the bot-account 2.0.0 archive

This is a full replacement project, not a drop-in token change.

1. Stop the old process and back up its `.env` and `data/` directory.
2. Extract this version into a fresh directory.
3. Create `.env` from the new example. Set the dashboard password, host and port.
4. Run `npm ci --ignore-scripts`, `npm run build`, and `npm start`.
5. Add each user-account token and destination webhook in the dashboard. Select channels explicitly.

Old bot tokens are not user tokens. Old `DISCORD_TOKEN`, `RELAY_GUILD_IDS`, `RELAY_CHANNEL_IDS`, `HEALTH_PORT` and other legacy environment settings are not imported. Re-enter the intended channel selections in the dashboard. The previous `relay.sqlite` database is not automatically migrated into account-specific mapping namespaces; pre-migration relays will not receive future edit/delete synchronization.

Keep the new `data/accounts.key` and `data/accounts.enc` together in backups. No `.env`, credentials, live database, node_modules or compiled output is included in the release ZIP. A package lock is included for reproducible installation.
