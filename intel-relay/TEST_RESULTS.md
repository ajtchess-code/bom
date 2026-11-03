# Validation — 2026-10-17 (3.0.2 root-host integration)

- `npm run build`: passed (TypeScript strict compilation).
- `npm test`: 20 tests passed, 0 failed.
- Dashboard inline JavaScript: syntax compilation passed.
- Real HTTP dashboard/AccountManager: login, create stopped account, preserve credentials on update, change channels, redact credentials and remove account passed through the automated suite.
- No real Discord credentials were used. No live messages were sent.
- Browser visual/interaction check could not run: Chromium was unavailable and the browser download failed. Docker container execution was not tested.

The logged simulated HTTP 503 during the failed-delete test is intentional; it verifies that the mapping and pending-delete record survive a transient failure.

## Original bug review

| Report | Finding / change |
| --- | --- |
| Delete during create | Confirmed; per-message queue and persistent pending-delete records. |
| Embed unfurl marked Edited | Confirmed; source edited timestamp controls label. Preview updates still synchronize. |
| Edit during create discarded | Confirmed; updates are queued. |
| Attachment fallback links lost on edit | Confirmed; attachments/links are rebuilt on edits, including removed attachments. |
| Upload rejection fails relay | Confirmed missing fallback; retry rejected file payload as source links. CDN links remain temporary. |
| Reserved webhook names | Original passed names unchanged; conservative generic-name fallback added. Actual platform behavior needs live testing. |
| Voice sync races | Confirmed; serial refresh queue and periodic retries. |
| Startup member-cache dependency | Original relied on channel.members; now uses voice-state cache with username/ID fallback. Live completeness remains unverified. |
| Embed text limits | Original did not budget combined text; capped/sanitized now. |
| Duplicate previews | Original copied embeds and retained unbracketed URLs; bracket copied preview URLs now. Actual rendering needs live testing. |
| System messages, stickers, polls | System messages skipped; sticker links and poll question/source pointer added where library exposes data. Full interactive poll copying is not implemented. |
| Startup-only cleanup | Periodic cleanup added; audit retention independent of mapping retention. |
| Failed delete discards mapping | Confirmed; mappings retained and deletion retried. |
| Additive guild/channel filters | Replaced with explicit channel selection and optional restrictive guild gate. |
| Voice ordering | Group by category position then channel position. Exact Discord-client custom ordering is not guaranteed. |
| Emoji/code-fence splitting | Surrogate-safe splits and standard fence close/reopen added. Complex Markdown may still differ across messages. |
| Empty health port | Replaced legacy setting with validated dashboard port; blank defaults to 3000, zero rejected. |
| Health information exposure | Public health now returns only process OK; account information requires login. |
| Docker root/no health check | Non-root user and health check added; Docker runtime not exercised. |
| Fatal exceptions only logged | Fatal exception/rejection causes controlled shutdown and nonzero exit. |
| Sparse tests | Expanded from 3 text tests to 19 regression tests. |

Terminal redesign: all referenced DOM controls and unique element IDs validated; JavaScript syntax check and all 19 regression tests passed. Browser visual verification remains unavailable.

Public-origin proxy regression test passed: HTTPS intel origin accepted with an internal HTTP Host; another public origin rejected; session cookie uses Secure. Five root-host helper tests pass separately.
