# System Architecture

Last updated: 2026-03-05

## Current Architecture (Implemented)

```text
SePay -> POST /webhook -> Cloudflare Worker (src/index.ts)
                          |- verify Authorization: Apikey <key>
                          |- validate Content-Type + parse JSON
                          |- validate payload shape (src/sepay.ts)
                          |- call upsertTransaction(payload, env)
                          `- return status 200/400/401/404/500
```

Components currently present:
- Worker entrypoint + request orchestration: `src/index.ts`
- SePay helpers + payload typing/guard: `src/sepay.ts`
- Notion handoff module (stub): `src/notion.ts`
- Worker config: `wrangler.toml`
- Type configuration: `tsconfig.json`, `worker-configuration.d.ts`
- Test coverage for webhook status paths: `test/index.spec.ts`

## Pending Architecture (Phase 3/4)

```text
SePay -> POST /webhook -> Worker -> Notion API
                                  |- query by Transaction ID
                                  |- create page when missing
                                  `- update page when existing
```

Pending implementation:
- Real Notion query/create/update in `src/notion.ts`.
- End-to-end deploy + live webhook validation.

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

Implemented in `src/index.ts`:
- `POST /webhook` only; all other routes/methods return `404`.
- Auth failure returns `401`.
- Invalid content-type, malformed JSON, or invalid payload shape return `400`.
- Downstream upsert throw returns `500`.
- Success returns `200` with JSON `{ "success": true }`.

## Data Contract Status

Implemented:
- Worker expects SePay payload with typed fields (`id`, `gateway`, `transactionDate`, `accountNumber`, `subAccount`, `code`, `content`, `transferType`, `transferAmount`, `accumulated`, `referenceCode`, `description`).
- `transferType` constrained to `"IN" | "OUT"`.

Pending:
- Notion property mapping + transaction-id dedup logic still in Phase 3.

## Testing Architecture

- Framework: Vitest with `@cloudflare/vitest-pool-workers`.
- Current coverage: 11 passing tests for `404/401/400/500/200` paths.
- Test styles:
  - unit-style calls to `worker.fetch`
  - integration-style requests via `SELF.fetch`
