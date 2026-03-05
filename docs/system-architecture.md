# System Architecture

Last updated: 2026-03-05

## Current Architecture (Implemented)

```text
HTTP Request -> Cloudflare Worker (src/index.ts) -> "Hello World!"
```

Components currently present:
- Worker entrypoint: `src/index.ts`
- Worker config: `wrangler.toml`
- Type configuration: `tsconfig.json`, `worker-configuration.d.ts`
- Test scaffold: `test/index.spec.ts`

## Target Architecture (Planned)

```text
SePay -> POST /webhook -> Worker
                          |- verify apikey header
                          |- parse payload JSON
                          |- Notion query by Transaction ID
                          `- Notion create/update page
```

Planned modules (not implemented yet):
- `src/sepay.ts` for payload typing + API key verification.
- `src/notion.ts` for query + upsert logic.

## Runtime + Infrastructure

- Platform: Cloudflare Workers
- Deploy tool: Wrangler (`npm run deploy`)
- Runtime compatibility: `nodejs_compat` enabled in `wrangler.toml`
- Main entry: `src/index.ts`

## Config + Secret Model

Expected runtime secrets:
- three values declared in `Env` interface in `src/index.ts`

Guideline:
- Keep secrets in Wrangler secrets (`wrangler secret put ...`), not in `[vars]`.

## Request Handling Model

Current:
- All requests receive `200` with `Hello World!`.

Planned:
- `POST /webhook` only.
- Auth failure: `401`.
- Invalid body: `400`.
- Internal/upsert error: `500`.
- Success: `200`.

## Data Mapping (Planned)

Target dedup key:
- SePay `id` mapped to a transaction-id field in Notion database.

Target mapping defined in plan docs:
- transfer content/title, amount, type, date, account, gateway, reference, sub-account fields.

## Testing Architecture

- Framework: Vitest with `@cloudflare/vitest-pool-workers`.
- Two scaffold tests exist:
  - direct unit-style call to `worker.fetch`
  - integration-style request via `SELF.fetch`

## Open Architecture Decisions

- Whether to add queue/retry buffering beyond sender retries.
- Whether to add request signature validation beyond API key header.
