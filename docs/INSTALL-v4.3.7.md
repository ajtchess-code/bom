# BOM v4.3.7 — Community Operations Update

This is a cumulative update for the complete October 22, 2026 source tree. It includes the intervening v4.3.3–v4.3.6 source changes and preserves the DM mute update. It is an overlay, not a complete standalone bot. No environment files, credentials, generated caches or installed dependencies are included.

## Install

1. Stop the bot processes and back up the current source and PostgreSQL database.
2. Extract the ZIP into the existing project root, overwriting the matching files. Preserve your existing `.env` and persistent `data` directories. Do not replace the whole project with this ZIP.
3. Install dependencies with `yarn install` (Yarn 1.22.22), or `npm install` if using npm. Next.js is pinned to 16.4.2 and Sharp to 0.35.5. Use Node 20.9 or newer.
4. Run `yarn migrate` (or `npm run migrate -w @bom/db`). This applies missing migrations including 099, 100 and 101. Do not skip migrations or manually edit the migration tracking table.
5. Run `yarn build`, or build shared, db, redis, controller, worker, API and dashboard workspaces in that order with npm. Restart the API, controller, dashboard and music workers through your existing host startup command.
6. Open the dashboard and verify the configuration below. Existing Discord surfaces refresh during the normal reconciliation cycle. Old generated battle image URLs receive a new renderer version automatically.

## Configure

- **Membership administration:** enable leave; configure the Control Desk text channel, Leave Request role, and membership/AFK role mappings. Private leave threads require Create Private Threads, Send Messages in Threads, Manage Threads and appropriate channel access. The bot needs the Server Members intent to add role members. Optional leave reasons stay private to the requester and officers.
- **Members → Leave of Absence:** set the returning-member review role and officer notification channel. Returning members require officer approval before old permissions or request access is restored. Server administration roles are always reviewed manually. Review errors remain visible for retry. Departure snapshots start when this version is installed; older departures cannot be reconstructed reliably.
- **Check-ins:** the dashboard administrator can send the existing member check-ins from the leave page. Membership/AFK mappings must be complete. DM mute settings also apply to check-ins, reminders and preferred-ship guidance.
- **Diplomacy:** create blocs and alliances, assign guilds, then record explicit guild/alliance treaties. No sample relationships are imported. The generated chart uses your saved records and shows independent guilds too.
- **Donations & Treasury:** set a verification/treasury role in Guild Operations Settings if needed. Enter an opening balance once. Members submit resources/items/chests after depositing them in-game; staff verify or decline. Treasury entries require exact positive whole gold amounts and reasons. Corrections use reversals; entries are not silently edited. The ledger records activity; it cannot verify the game's inventory automatically.
- **Administration → Permission Presets:** capture a channel's overrides, name the preset, select one or more presets and order them highest first. Select channels and/or categories, preview, then apply. Category changes affect Discord-synced children. Unsynced children require explicit selection. Each channel reports success, conflict or failure. Undo respects subsequent permission changes. Recover interrupted batches from history after the preview expires.
- **Ships:** My Profile & Ships remains available on the dashboard. The signup index and guidance DMs also offer Set Preferred Ships. The Discord selector supports rate selection and paged playable/preferred multi-selects; Save Profile commits only that rate. Incomplete setup expires after 15 minutes and can be restarted. Automatic saved-profile signup requires playable and preferred ships. Manual detailed signup still supports explicit battle-specific choices.
- **Music:** use Request Music or send a song/playlist link or song name directly in the configured desk channel. Actively playing bots have their own player cards above the desk. Inspect recovery and playback timeline details in the music dashboard.

## Permission preset priority

Presets copy **channel overrides**, not server-wide role definitions, role ordering, category structure or channel settings. Individual member overrides are opt-in when capturing.

For the same target role/member and permission bit, the highest preset's explicit allow or deny wins. Lower presets fill bits the higher preset leaves unspecified. In Merge mode, existing channel permissions are the lowest layer. Replace mode replaces the selected channel's entire override list.

Discord still combines different roles using its own permission rules. A Member-role deny does not universally override a Friend-role allow for someone holding both roles. Preset order cannot change Discord's cross-role evaluation. Review the preview and actual effective access for your role combinations before applying broadly.

## Scope and retained records

YIP is removed from active guild catalogues, alliance memberships/relationships, allied access grants and schedule sections. Historical battles, donations, audit logs and previous map snapshots are retained. The schedule now shows only guilds with scheduled battles; when empty it says “No port battles scheduled.”

The public WoSB Battle Map & Diplomacy surface shows today's remaining attackable ports, organized by priority guild, faction and alliance. Detailed Battle Map privately shows every port. Taxes remain on the map/dashboard; the public text focuses on protection and attack timing. Sticky surfaces reposition as a group without pinning; active music players remain above them.

The old crafting tracker is **not installed** by this update. See `docs/CRAFTING-TRACKER-PROPOSAL-v4.3.7.md` for the streamlined proposal and historical assumptions that need confirmation.

## Post-install review

Verify one private leave request and return reminder, one muted and unmuted DM, one ship-profile save, one diplomacy request, one new battle banner, a manually deleted signup panel, and a small permission-preset batch with undo. Configure roles/channels before inviting members to use the new tools. Local tests use simulated Discord responses; they do not prove live server permissions, music worker reconnection or external API availability.
