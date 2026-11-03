# BOM v4.4.0 — Admin and Port Battle Invitations

Apply this update over v4.3.0. It preserves the earlier Ask, Wiki, rules, media, welcome and fleet fixes. No environment files, credentials, dependencies or compiled build directories are included.

## Installation

1. Back up the application and database, stop API/controller/dashboard, and overlay the ZIP contents at the repository root.
2. Build the shared libraries, database package, API, controller and dashboard using the normal host bootstrap. The database package must rebuild before the API and controller because it now exports the credential service.
3. Apply database migration `031_invitations_credentials.sql` before starting services. The existing Novonode bootstrap runs migrations automatically. For a manual deployment, run the existing workspace migration command after rebuilding `@bom/db`.
4. Start services, open **Admin → OpenAI Connection**, save your project API key, and use **Test Connection**. Configure the question channel and roles in **Admin → Ask & Rules**.

Dashboard credentials use AES-256-GCM with a fresh random nonce per save. Both API and controller must share the same stable `CREDENTIAL_ENCRYPTION_KEY`, or the existing `INTERNAL_API_TOKEN`, of at least 32 characters. Keep this host secret with your database backup: changing it makes existing encrypted keys unreadable until replaced through Admin. `CREDENTIAL_ENCRYPTION_KEY`, if set, takes precedence. Do not enter that encryption secret into the OpenAI API Key field.

A dashboard key takes precedence over `OPENAI_API_KEY`; removing it restores the environment fallback. Saving/replacing/removing applies to new requests without restarting. The browser receives configuration status only. The test checks `/models` authentication and does not generate a paid answer; a successful test does not guarantee access to every model or billing availability. Existing optional feature flags/model environment settings continue to apply. #ask uses its dashboard enable switch.

## Manual invitations

In **Port Battles**, select an open future battle and choose **Invite Members by DM**. Search the server member list by name, username or saved ships; check recipients, then press **Send DM Invitations**. Up to 100 recipients may be selected per action. This is never triggered automatically when creating a battle.

The DM shows the battle, rate, date and Discord's live relative timestamp. Its signup button uses the recipient's current saved playable/preferred ships for that rate, filtered to the current catalogue and configured allowed ships. It rechecks server membership/signup permissions through the existing signup API. Members with no usable saved ships are directed to their profile. Existing signups are preserved, including simultaneous signup requests. Roster assignment remains an officer action.

Delivery runs from a durable controller queue, at most one recipient every two seconds. The picker refreshes delivery states every ten seconds. Already-signed-up members are skipped; bots cannot be selected. Duplicate requests do not generate repeat DMs. Closed/started battles are skipped at delivery and rejected at signup. Closed DMs, departed members and delivery failures appear in the picker. Uncertain interrupted deliveries are marked failed after ten minutes and are not retried automatically. Each member can receive one invitation per battle; contact them separately after verifying a failed delivery.

DM timestamps reflect the schedule when sent. The dashboard and signup button use the current schedule if officers reschedule a battle. A clickable dashboard link is included when `PUBLIC_DASHBOARD_URL` is configured.

The bot needs the Discord Server Members privileged intent enabled, permission to access the server, and the usual ability to DM recipients. Invitation actions are restricted to configured Port Battle managers or dashboard administrators. No messages are sent merely by browsing the picker.

## Configuration map

| Admin section | Configuration moved or collected here |
| --- | --- |
| Membership & Welcome | Welcome, control desk, leave, diplomacy, roster, custom roles/media, prefixes and connected roles |
| Ask & Rules | Ask channel, assistance and correction roles, numbered server rules and Trade DM rules |
| OpenAI Connection | Encrypted API key, credential source, replacement/removal and authentication test |
| Recruitment | Application/trial policy, staff roles and canned response templates |
| Port Battles | Manager/signup roles, channels, ships, guilds, default targets and doctrine |
| Music | Server playback defaults, music role permissions, radio, resolver and recommendation settings |
| Automations & Social | Temporary voice rooms, automatic threads/reactions and social feed delivery |
| Branding | Controller/worker identities, colors and visual assets |
| Wiki & Knowledge | Article studio, corrections, source health and language/terminology tools |
| Sentinel | Archive/retention policy, backup configuration and channel permissions |
| Platform & Access | Platform feature flags, setup, member-rank mapping and configuration import/export |
| Diagnostics | Service health, worker availability and performance |

Admin has a persistent searchable section menu and a compact mobile section selector. The global sidebar now has one Admin entry rather than several unrelated settings destinations. Existing Membership and Port Battle Admin URLs remain valid. Recruitment settings, Membership Admin, Wiki Studio and Sentinel settings/permissions entry points lead to the centralized pages. Older Admin `view=advanced` and `view=diagnostics` links are migrated to their new destinations.

Personal playback choices, appearance, notification preferences, roster planning, recruitment case handling, Wiki reading/search, Sentinel event investigation and backup/recovery actions remain in their feature areas. Moving server configuration does not change saved values or permission requirements.

## Validation

- API, controller, database package and production dashboard builds passed.
- Ten repository tests passed, including credential encryption/tamper rejection and invitation countdown/recipient/closed-battle behavior.
- Fresh PostgreSQL-compatible migration and integration checks passed: key persistence/admin protection, invitation duplicate suppression, simulated DM delivery, signup recipient binding, closed-battle rejection and concurrent signup protection. The earlier 73-ship, 39-article, corrections and rules integration checks also passed.
- Browser checks passed for Admin routing, password-field clearing after save, invitation selection/send feedback and 390px mobile layouts without horizontal overflow.
- Discord delivery and OpenAI authentication were simulated. Production credentials, live server member permissions, real recipient DMs and paid model responses were not exercised.

For repeatable repository regression checks, rebuild `@bom/shared`, `@bom/db` and `@bom/controller`, then run `node --test scripts/tests/*.test.mjs`.
