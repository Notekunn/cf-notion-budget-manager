# Codebase Summary

Generated: 2026-03-05
Source snapshot: `repomix-output.xml` (generated via `repomix`)

## Repo Snapshot

- Total files packed: 31
- Main runtime: Cloudflare Workers + TypeScript
- Main deploy tool: Wrangler
- Main integration target: Notion API

## Current Implementation State

- Worker exists and compiles with Worker types.
- Current route behavior: accepts only `POST /webhook`.
- Request pipeline implemented: API key check -> JSON/content-type + payload validation -> upsert handoff.
- Notion SDK installed; `upsertTransaction()` is wired but still placeholder in `src/notion.ts`.
- Test suite validates webhook status contract (`11` passing tests).

## Key Files

| File | Purpose |
|---|---|
| `src/index.ts` | Webhook route orchestration and response codes |
| `src/sepay.ts` | SePay payload typing, payload guard, API key verification |
| `src/notion.ts` | Notion upsert interface (phase-3 stub) |
| `wrangler.toml` | Worker runtime/deploy config |
| `package.json` | scripts + dependencies |
| `tsconfig.json` | strict TS compiler settings |
| `vitest.config.mts` | test config for worker pool |
| `test/index.spec.ts` | unit-style and integration-style webhook tests |
| `plans/260305-0812-sepay-webhook-notion/*` | implementation plan phases |

## Remaining Scope

- Implement real Notion query/create/update by `Transaction ID`.
- Add property mapping from SePay payload to Notion schema.
- Validate end-to-end webhook flow on deployed Worker URL.

## Environment Keys (Expected)

- Three Worker env keys are declared in `src/index.ts` (`Env` interface).

## Technical Notes

- `wrangler.toml` includes `compatibility_flags = ["nodejs_compat"]`, needed for Node-leaning libraries in Worker runtime.
- `worker-configuration.d.ts` is large and dominates token footprint in packed snapshot; exclude from future AI packs if context budget tight.
