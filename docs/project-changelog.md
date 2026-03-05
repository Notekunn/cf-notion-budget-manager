# Project Changelog

## 2026-03-05

### Added

- Initial Cloudflare Worker scaffold with TypeScript.
- Worker entrypoint at `src/index.ts`.
- Vitest worker test scaffold under `test/`.
- Planning docs for 4-phase implementation.
- `src/sepay.ts` with:
  - `SepayWebhookPayload` interface
  - `verifyApiKey()` helper
  - `isSepayWebhookPayload()` type guard
- `src/notion.ts` full `upsertTransaction()` implementation:
  - resolve data source from data source id or database id fallback
  - query by `Transaction ID` with pagination
  - update all matching pages or create when no match
  - per-transaction in-memory queue to serialize concurrent upserts
- `test/notion-upsert.spec.ts` with upsert behavior coverage (4 tests).

### Changed

- `wrangler.toml` configured with:
  - `name = "notion-budget-manager"`
  - `main = "src/index.ts"`
  - `compatibility_date = "2026-03-01"`
  - `compatibility_flags = ["nodejs_compat"]`
- Runtime dependency `@notionhq/client` added.
- `src/notion.ts` now passes `fetch: globalThis.fetch.bind(globalThis)` into Notion client to prevent Cloudflare Workers `illegal invocation`.
- `src/index.ts` replaced hello-world response with phase-2 webhook flow:
  - accept only `POST /webhook` (`404` otherwise)
  - verify `Authorization: Apikey <key>` (`401` on failure)
  - enforce JSON content type + parse/shape validation (`400` on invalid input)
  - call `upsertTransaction(payload, env)` with `500` catch path
  - return `200` JSON body `{ "success": true }` on success

### Verified

- `npx tsc --noEmit` passes.
- `npm test -- --run` passes (`18/18` tests).

### Pending Follow-ups

- Validate full end-to-end flow with deployed Worker + live SePay webhook.
