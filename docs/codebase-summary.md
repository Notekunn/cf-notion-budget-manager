# Codebase Summary

Generated: 2026-03-07
Source snapshot: `repomix-output.xml` (generated via `repomix`)

## Repo Snapshot

- Total files packed: 28
- Main runtime: Cloudflare Workers + TypeScript
- Main deploy tool: Wrangler
- Main integration target: Notion API

## Current Implementation State

- Worker exists and compiles with Worker types.
- Route behavior: `POST /webhook`, `POST /budget`, plus cron `scheduled` handler.
- Request pipeline: API key check -> payload/month validation -> Notion operations.
- Notion integration:
  - tx upsert + dedup by `Transaction ID`
  - tx-to-monthly-budget linking
  - dynamic budget DB formula/property sync from JAR config DB
- Test suite passes (`36` tests).

## Key Files

| File | Purpose |
|---|---|
| `src/index.ts` | Webhook + budget route + scheduled orchestration |
| `src/sepay.ts` | SePay payload typing, payload guard, API key verification |
| `src/notion.ts` | Notion tx upsert + budget linking |
| `src/notion-client.ts` | Shared Notion client + data-source-id resolution |
| `src/budget-service.ts` | JAR budget schema sync + monthly budget ops |
| `wrangler.toml` | Worker runtime/deploy config |
| `package.json` | scripts + dependencies |
| `tsconfig.json` | strict TS compiler settings |
| `vitest.config.mts` | test config for worker pool |
| `test/index.spec.ts` | unit-style and integration-style webhook tests |
| `test/notion-upsert.spec.ts` | Notion upsert behavior tests |
| `plans/260305-0812-sepay-webhook-notion/*` | implementation plan phases |

## Remaining Scope

- Validate live Notion Formula 2.0 expressions in workspace.
- Validate end-to-end webhook + budget flow on deployed Worker URL.
- Add deploy/rollback runbook for operations.

## Environment Keys (Expected)

- `NOTION_TOKEN`
- `NOTION_DB_ID`
- `NOTION_BUDGET_DB_ID`
- `NOTION_JARS_CONFIG_DB_ID`
- `SEPAY_API_KEY`

## Technical Notes

- `wrangler.toml` includes `compatibility_flags = ["nodejs_compat"]` and cron trigger `0 0 1 * *`.
- `worker-configuration.d.ts` dominates token footprint in snapshot (~86%); exclude in future packs when context budget tight.
