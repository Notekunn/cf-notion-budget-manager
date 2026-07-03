# Project Changelog

## 2026-07-02

### Added

- Telegram guided transaction input:
  - `POST /telegram/webhook`
  - `src/telegram-bot.ts`
  - `src/telegram-state.ts`
  - `src/category-service.ts`
- Notion tx detail update helper for `Name`, `Category`, and `JAR`.
- `TELEGRAM_STATE` KV binding contract.
- `TELEGRAM_WEBHOOK_SECRET` secret contract.
- Tests:
  - `test/telegram-state.spec.ts`
  - `test/category-service.spec.ts`
  - `test/transaction-details.spec.ts`
  - `test/telegram-bot.spec.ts`
  - `test/telegram.spec.ts`

### Changed

- `POST /webhook` now schedules Telegram Input prompt after successful Notion upsert.
- `src/telegram.ts` supports inline keyboards, callback ack, message delete, and returned message ids.
- Telegram callbacks now require tracked message ids, preventing stale buttons from mutating newer state after cleanup failure.
- Telegram callback acknowledgements are best-effort and no longer block confirm updates.
- Budget linking uses `Monthly Budget` relation and restores budget property sync on missing monthly budget.
- Worker types regenerated for `TELEGRAM_STATE`; `TELEGRAM_WEBHOOK_SECRET` typed without storing a secret value.

### Verified

- `npx tsc --noEmit` passes.
- `npm test` passes (`120/120` tests).

## 2026-03-07

### Added

- `src/notion-client.ts` for shared Notion client init + data-source-id resolution.
- `src/budget-service.ts` for:
  - JAR config fetch
  - monthly budget lookup/create
  - budget DB formula property sync
  - transaction-to-budget relation linking
- New tests:
  - `test/budget-service.spec.ts`
  - `test/budget-endpoint.spec.ts`
  - `test/notion-budget-linking.spec.ts`

### Changed

- `src/index.ts`:
  - added env vars: `NOTION_BUDGET_DB_ID`, `NOTION_JARS_CONFIG_DB_ID`
  - added `POST /budget` route (same API key auth as webhook)
  - added `scheduled` handler for monthly budget auto-create
- `src/notion.ts`:
  - `upsertTransaction()` now returns transaction page id
  - webhook flow now ensures monthly budget + links transaction to it
  - budget-linking failure is non-blocking (warn only)
- `wrangler.toml`:
  - added secret setup comments for new env vars
  - added cron trigger: `0 0 1 * *`
- Test updates:
  - `test/index.spec.ts` env/type alignment for new `Env`
  - `test/notion-upsert.spec.ts` env/type alignment

### Verified

- `npx tsc --noEmit` passes.
- `npm test -- --run` passes (`36/36` tests).

### Fixed

- Reduced noisy Notion SDK warn logs by setting Notion client `logLevel` to `error` in `src/notion-client.ts`.

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
