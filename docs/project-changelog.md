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
- `src/notion.ts` with `upsertTransaction()` handoff stub for Phase 3.
- Webhook tests covering route/auth/body/downstream/success status paths (11 tests).

### Changed

- `wrangler.toml` configured with:
  - `name = "notion-budget-manager"`
  - `main = "src/index.ts"`
  - `compatibility_date = "2026-03-01"`
  - `compatibility_flags = ["nodejs_compat"]`
- Runtime dependency `@notionhq/client` added.
- `src/index.ts` replaced hello-world response with phase-2 webhook flow:
  - accept only `POST /webhook` (`404` otherwise)
  - verify `Authorization: Apikey <key>` (`401` on failure)
  - enforce JSON content type + parse/shape validation (`400` on invalid input)
  - call `upsertTransaction(payload, env)` with `500` catch path
  - return `200` JSON body `{ "success": true }` on success

### Verified

- `npx tsc --noEmit` passes.
- `npm test -- --run` passes (`11/11` tests).

### Pending Follow-ups

- Implement real Notion query/create/update logic in `src/notion.ts`.
- Validate full end-to-end flow with deployed Worker + live SePay webhook.
