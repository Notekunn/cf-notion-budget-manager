# System Architecture

Last updated: 2026-03-05

## Current Architecture (Implemented)

```text
SePay -> POST /webhook -> Cloudflare Worker (src/index.ts)
                          |- verify Authorization: Apikey <key>
                          |- validate Content-Type + parse JSON
                          |- validate payload shape (src/sepay.ts)
                          |- call upsertTransaction(payload, env) (src/notion.ts)
                          |   |- resolve data source id (data source id or database id fallback)
                          |   |- query by "Transaction ID" with pagination
                          |   |- update all existing matched pages, else create new page
                          |   `- serialize same tx-id upserts via in-memory queue
                          `- return status 200/400/401/404/500
```

Components currently present:
- Worker entrypoint + request orchestration: `src/index.ts`
- SePay helpers + payload typing/guard: `src/sepay.ts`
- Notion upsert module (implemented): `src/notion.ts`
- Worker config: `wrangler.toml`
- Type configuration: `tsconfig.json`, `worker-configuration.d.ts`
- Test coverage for webhook status + Notion upsert paths: `test/index.spec.ts`, `test/notion-upsert.spec.ts`

## Pending Architecture (Phase 3/4)

```text
SePay -> POST /webhook -> Worker -> Notion API -> live validation + monitoring
```

Pending implementation:
- End-to-end deploy + live webhook validation.
- Operational runbook for retries/rollback.

## Runtime + Infrastructure

- Platform: Cloudflare Workers
- Deploy tool: Wrangler (`npm run deploy`)
- Runtime compatibility: `nodejs_compat` enabled in `wrangler.toml`
- Notion client on Workers must use bound fetch (`globalThis.fetch.bind(globalThis)`) to avoid `TypeError: Illegal invocation`
- Main entry: `src/index.ts`

## Config + Secret Model

Expected runtime secrets:
- `NOTION_TOKEN`
- `NOTION_DB_ID`
- `SEPAY_API_KEY`

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
- Notion property mapping in `src/notion.ts` for `Name`, `Amount`, `Type`, `Date`, `Account`, `Gateway`, `Transaction ID`, `Reference`, `Sub Account`.
- Dedup/update path uses `Transaction ID` query + per-id queue serialization.

## Testing Architecture

- Framework: Vitest with `@cloudflare/vitest-pool-workers`.
- Current coverage: 18 passing tests:
  - 14 webhook route/status tests
  - 4 Notion upsert logic tests
- Test styles:
  - unit-style calls to `worker.fetch`
  - integration-style requests via `SELF.fetch`
