# Codebase Summary

Generated: 2026-03-05
Source snapshot: `repomix-output.xml` (generated via `repomix`)

## Repo Snapshot

- Total files packed: 28
- Main runtime: Cloudflare Workers + TypeScript
- Main deploy tool: Wrangler
- Main integration target: Notion API

## Current Implementation State

- Worker exists and compiles with Worker types.
- Current route behavior: accepts only `POST /webhook`.
- Request pipeline implemented: API key check -> JSON/content-type + payload validation -> upsert handoff.
- Notion SDK integration implemented in `src/notion.ts`:
  - resolve data source id (direct id or database fallback)
  - query by `Transaction ID` with pagination
  - update matches or create missing page
  - in-memory per-transaction queue for serialized concurrent upserts
- Test suite passes (`18` tests).

## Key Files

| File | Purpose |
|---|---|
| `src/index.ts` | Webhook route orchestration and response codes |
| `src/sepay.ts` | SePay payload typing, payload guard, API key verification |
| `src/notion.ts` | Notion upsert implementation |
| `wrangler.toml` | Worker runtime/deploy config |
| `package.json` | scripts + dependencies |
| `tsconfig.json` | strict TS compiler settings |
| `vitest.config.mts` | test config for worker pool |
| `test/index.spec.ts` | unit-style and integration-style webhook tests |
| `test/notion-upsert.spec.ts` | Notion upsert behavior tests |
| `plans/260305-0812-sepay-webhook-notion/*` | implementation plan phases |

## Remaining Scope

- Validate end-to-end webhook flow on deployed Worker URL.
- Confirm live Notion schema alignment in production workspace.
- Add deploy/rollback runbook for operations.

## Environment Keys (Expected)

- `NOTION_TOKEN`
- `NOTION_DB_ID`
- `SEPAY_API_KEY`

## Technical Notes

- `wrangler.toml` includes `compatibility_flags = ["nodejs_compat"]`, needed for Node-leaning libraries in Worker runtime.
- `worker-configuration.d.ts` dominates token footprint in snapshot (~86%); exclude in future packs when context budget tight.
