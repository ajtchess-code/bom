# Port Battle command experience

## Host installation

1. Stop the server and back up the database and server files.
2. Extract the update ZIP directly into `/home/container`, overwriting matching files. The ZIP contains changed source files only and does not contain environment files or dependencies. It requires the current BOM Casino / Community and Host Installer updates already installed.
3. Use `index.js` as the startup file. Leave `SKIP_STARTUP_BUILD` unset or false. Startup builds the source, removes retired files, and runs migration 124 automatically. No dependency changes are required by this update.
4. Start the server and wait for the dashboard and Discord bot to become ready.
5. In Admin → Port Battles, set the Officer chat ID, Alliance chat ID, nightly reminder time/time zone, and Horn/Flare Wiki guide URLs. The bot needs View Channel, Send Messages, Embed Links, and Read Message History in those chats.

Default scheduling uses America/Chicago including daylight saving time. With a +60 minute game offset, 21:00 in-game schedules for 22:00 Central. The ±1 hour controls change new scheduling conversions; they do not silently move already scheduled battles.

## Changes

- Rounded, compact top navigation and a cleaner Port Battle command board.
- Compact captain cards without repeated playable/preferred ship lists.
- Open battles accept signups and invitation responses after their scheduled start. Closed/finished/cancelled battles retain their explicit state restrictions.
- Discord Preferred Ships opens a native, paginated manager. Missing preferences are requested for the relevant rate only. Saved selections for other rates are preserved.
- Drag a captain into a role or ship group, or select the ship before dragging. Captains can remain in the confirmed fleet awaiting a ship. Role and ship groups organize the fleet automatically; managers can choose any ship available in the battle's rate.
- Add a named guest, or search and link a Discord member, with a rate-valid ship.
- Fleet Templates has Use, Create, and Save actions. Saved templates include roster, duties, ship targets, team size, and attacker/defender settings. Applying a roster template restores its saved captains and returns other existing captains to the signup pool.
- Manage Battle / AAR is a visible button. Win/Draw/Loss closes the battle in one request. A screenshot is optional. AAR submission is tracked separately from result close-out.
- Attendance and audited corrections live in the AAR. Copy Previous Roster, Tactical Briefs, Fleet Tools, and historical role suggestions are removed from the active manager.
- Cancellation supports preset reasons and separate silent / notify actions.
- Discord index and signup controls offer “I can no longer attend.”
- One editable DM overview per captain shows active signups, relative start times, assigned ship, Horn/Flare duties, and configured guide links. Existing DM preferences are respected.
- Nightly Officer reminders have per-battle Win/Draw/Loss buttons; completed entries disappear on refresh. Alliance reminders list missing AARs. Only battles created and starting after migration activation enter the reminder cohort; historical battles are excluded.
- Multi-Battle Board is a separate Port Battles section. Plan each captain's tension fights, battles, and travel legs, exact arrival deadlines, sailing instructions, and reserved Small/Large Fast Travels. Plans can be added and removed, with overlap warnings and per-captain totals.

## Validation

API/controller/dashboard TypeScript checks and production dashboard build passed. Automated coverage includes full migration replay, late self signup/invitation response, native preference draft protection, unrestricted assignments, template restoration, result close-out, independent itineraries, nightly rollout filtering and buttons, silent cancellation, and Central daylight saving conversions.

Browser screenshot QA could not run because this execution environment prohibits Chromium's required socket operation. Verify desktop/mobile appearance and Discord message delivery in the live guild after installation.
