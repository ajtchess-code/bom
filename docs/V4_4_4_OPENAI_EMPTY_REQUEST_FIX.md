# BOM v4.4.4 — OpenAI Connection Test Request Fix

The supplied API log showed `/v1/community/openai/test` returning HTTP 400 almost immediately. The Admin page attached a JSON content-type header to its bodyless Test Connection request. Fastify rejected it with `FST_ERR_CTP_EMPTY_JSON_BODY` before the connection-test route could run. Remove Dashboard Key used the same request pattern.

The Admin page now sends JSON headers only when there is a JSON body. The internal dashboard proxy also strips JSON content-type headers from truly empty requests, covering older browser pages and other bodyless dashboard actions. Actual JSON bodies, malformed nonempty JSON and upload content types are preserved for normal API validation. Authentication, origin checks, key encryption and saved credentials are unchanged.

## Installation

This cumulative update applies over v4.3.0 through v4.4.3 and includes all previous changes. Stop the server, extract into the repository root with overwrites, and restart so the dashboard rebuilds. Keep your existing environment files. No new database migration is introduced.

Refresh **Admin → OpenAI Connection**, then press **Test Connection** again. Your saved key remains configured. A successful authentication check does not establish billing or access to every model. If another error appears, the page now prefers the API's detailed message over its generic error title.

## Validation

- Production dashboard build passed.
- All 18 repository tests passed. New tests reproduce the previous parser failure with real Fastify, exercise the corrected test/removal routes with mocked OpenAI responses, verify administrator enforcement, and check JSON/upload forwarding behavior.
- Browser checks exercised Save API Key → Test Connection → Remove Dashboard Key against a mock server that rejects the old empty-JSON request pattern.
- No real OpenAI key was used, no paid answer was generated, and no live saved credential was removed during validation.

To rerun tests, build the shared/database/controller/API workspaces before `node --test scripts/tests/*.test.mjs`.
