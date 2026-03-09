# System Architecture

Last updated: 2026-03-07

## Current Architecture (Implemented)

```text
SePay -> POST /webhook -> Worker
                         |- auth + payload validation
                         |- upsert transaction by Transaction ID
                         |- ensure monthly budget for tx month
                         |- link tx page -> Monthly Budget relation
                         `- return 200/400/401/404/500

Manual -> POST /budget -> Worker -> ensure monthly budget (idempotent)
Cron  -> scheduled     -> Worker -> ensure monthly budget (idempotent)
```

Components currently present:
- Worker entrypoint + routes + scheduled handler: `src/index.ts`
- SePay helpers + payload typing/guard: `src/sepay.ts`
- Notion tx upsert + budget hook module: `src/notion.ts`
- Notion client/data-source resolver: `src/notion-client.ts`
- JAR budget service module: `src/budget-service.ts`
- Worker config + cron trigger: `wrangler.toml`
- Type configuration: `tsconfig.json`, `worker-configuration.d.ts`
- Test coverage includes budget service/route/linking paths.

## Pending Architecture

Pending implementation:
- Live Notion formula validation for relation-filter expressions.
- End-to-end deploy validation + ops runbook.

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
- `NOTION_BUDGET_DB_ID`
- `NOTION_JARS_CONFIG_DB_ID`
- `SEPAY_API_KEY`

Guideline:
- Keep secrets in Wrangler secrets (`wrangler secret put ...`), not in `[vars]`.

## Request Handling Model

Implemented in `src/index.ts`:
- `POST /webhook` and `POST /budget`; all other routes/methods return `404`.
- Auth failure returns `401`.
- Invalid content-type, malformed JSON, invalid payload shape, or invalid month return `400`.
- Downstream upsert/budget create throw returns `500`.
- Success returns `200` with JSON `{ "success": true }`.
- Scheduled cron calls same budget ensure flow as `POST /budget`.

## Data Contract Status

Implemented:
- Worker expects SePay payload with typed fields (`id`, `gateway`, `transactionDate`, `accountNumber`, `subAccount`, `code`, `content`, `transferType`, `transferAmount`, `accumulated`, `referenceCode`, `description`).
- `transferType` constrained to `"IN" | "OUT"`.
- Notion property mapping in `src/notion.ts` for `Name`, `Amount`, `Type`, `Date`, `Account`, `Gateway`, `Transaction ID`, `Reference`, `Sub Account`.
- Dedup/update path uses `Transaction ID` query + per-id queue serialization.
- Budget DB dynamic properties synced via `databases.update`:
  - `Total Income`
  - `{JAR} %`, `{JAR} Budget`, `{JAR} Actual`, `{JAR} Remain`

## Testing Architecture

- Framework: Vitest with `@cloudflare/vitest-pool-workers`.
- Current coverage: 36 passing tests:
  - webhook route/status tests
  - Notion upsert logic tests
  - budget service tests
  - budget route + scheduled tests
  - budget-linking webhook tests
- Test styles:
  - unit-style calls to `worker.fetch`
  - integration-style requests via `SELF.fetch`
