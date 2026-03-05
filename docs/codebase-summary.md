# Codebase Summary

Generated: 2026-03-05
Source snapshot: `repomix-output.xml` (generated via `repomix`)

## Repo Snapshot

- Total files packed: 18
- Main runtime: Cloudflare Workers + TypeScript
- Main deploy tool: Wrangler
- Main integration target (planned): Notion API

## Current Implementation State

- Worker exists and compiles with Worker types.
- Current response behavior: returns `Hello World!`.
- Notion SDK installed but not yet used in runtime code.
- Test scaffold validates current hello-world behavior.

## Key Files

| File | Purpose |
|---|---|
| `src/index.ts` | Worker entrypoint and fetch handler |
| `wrangler.toml` | Worker runtime/deploy config |
| `package.json` | scripts + dependencies |
| `tsconfig.json` | strict TS compiler settings |
| `vitest.config.mts` | test config for worker pool |
| `test/index.spec.ts` | unit-style and integration-style tests |
| `plans/260305-0812-sepay-webhook-notion/*` | implementation plan phases |

## Planned System Direction

- Add webhook route (`POST /webhook`).
- Verify SePay API key via request auth header.
- Upsert transaction data to existing Notion DB.
- Return status-based responses for auth/body/upsert errors.

## Environment Keys (Expected)

- three worker env keys defined in `src/index.ts`.

## Technical Notes

- `wrangler.toml` includes `compatibility_flags = ["nodejs_compat"]`, needed for Node-leaning libraries in Worker runtime.
- `worker-configuration.d.ts` is large and dominates token footprint in packed snapshot; exclude from future AI packs if context budget tight.
