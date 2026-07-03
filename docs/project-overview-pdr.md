# Project Overview + PDR

Last updated: 2026-07-02
Version: 0.5.0-telegram-input

## Project Overview

`notion-budget-manager` is a Cloudflare Worker project for SePay webhook ingestion, Notion transaction sync, JAR-based monthly budgeting, and Telegram-guided transaction enrichment.

Current implemented state (verified in code):
- Worker scaffold exists with strict TypeScript + Wrangler config.
- `src/index.ts` handles `POST /webhook`, `POST /telegram/webhook`, `POST /budget`, `POST /subscription-alerts`, chart routes, and `scheduled`.
- API key auth enforced for SePay/internal POST routes; Telegram webhook uses Telegram secret-token header.
- `src/notion.ts` upserts transactions and non-blocking links each tx to monthly budget.
- `src/budget-service.ts` handles JAR config fetch, budget DB schema sync, monthly budget find/create, and tx->budget link.
- `src/telegram-bot.ts` handles one active transaction input flow per Telegram chat using KV.
- Cron triggers configured: `0 0 1 * *`, `0 0 * * *`.
- Test suite passes (`120` tests).

## Product Scope

In scope:
- Webhook receiver on Cloudflare Workers.
- API key verification using SePay key.
- Notion upsert by transaction ID.
- JAR config + monthly budget automation in Notion.
- Telegram guided input for transaction `Name`, `Category`, and `JAR`.

Out of scope (for now):
- Multi-chat transaction assignment beyond configured `TELEGRAM_CHAT_ID`.
- Category/JAR button pagination.
- Admin UI/dashboard.
- Multi-provider payment ingestion.

## Functional Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-1 | Worker scaffold with Wrangler + TypeScript | Completed |
| FR-2 | Runtime secrets defined in worker Env interface are configured in Cloudflare | Pending runtime verification |
| FR-3 | `POST /webhook` route handling | Completed |
| FR-4 | Verify inbound API key auth header | Completed |
| FR-5 | Parse + validate SePay JSON payload | Completed |
| FR-6 | Upsert transaction in Notion DB by `Transaction ID` | Completed |
| FR-7 | Return status codes for auth/body/upsert failures | Completed |
| FR-8 | Automated tests for webhook route/status contract | Completed |
| FR-9 | `POST /budget` manual monthly budget creation | Completed |
| FR-10 | Cron-triggered monthly budget creation | Completed |
| FR-11 | Auto-link transaction to monthly budget by tx month | Completed |
| FR-12 | Dynamic per-JAR formula property sync on budget DB | Completed |
| FR-13 | Automated tests for budget service, budget route, and budget linking | Completed |
| FR-14 | Send Telegram Input prompt after successful SePay upsert | Completed |
| FR-15 | `POST /telegram/webhook` with secret-token verification | Completed |
| FR-16 | One active Telegram tx state per configured chat via KV | Completed |
| FR-17 | Name -> Category -> JAR -> Confirm/Cancel flow | Completed |
| FR-18 | Confirm updates Notion `Name`, `Category`, and `JAR` | Completed |
| FR-19 | Cancel clears state without Notion update | Completed |
| FR-20 | Automated tests for Telegram state, flow, route integration, and Notion detail update | Completed (120 passing tests) |

## Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-1 | Runtime | Cloudflare Workers |
| NFR-2 | Language | TypeScript strict mode |
| NFR-3 | Idempotency | Duplicate webhook should not create duplicate Notion rows |
| NFR-4 | Security | Secrets stored in Wrangler secrets, not source |
| NFR-5 | Reliability | On Notion failure, return non-2xx so sender can retry |
| NFR-6 | Telegram reliability | Telegram prompt/delete failures do not fail SePay webhook success |

## Acceptance Criteria

Phase 4/5 done when:
1. `POST /webhook` with wrong API key returns `401`.
2. `POST /webhook` with malformed or invalid body returns `400`.
3. Non-`POST /webhook` requests return `404`.
4. Downstream upsert failure returns `500`.
5. Valid request returns `200` with `{ "success": true }`.
6. Upsert updates existing Notion rows by `Transaction ID`.
7. Upsert creates new Notion row when `Transaction ID` is missing.

Current release done when:
1. Valid `POST /webhook` updates/creates a Notion row in deployed environment.
2. Invalid API key returns `401`.
3. Malformed JSON returns `400`.
4. Notion failures return `500`.
5. New tx sends Telegram Input prompt without blocking SePay success.
6. Telegram confirm updates `Name`, `Category`, and `JAR`.
7. Telegram cancel clears state without Notion update.

## Constraints + Dependencies

- Cloudflare account + Wrangler auth required.
- Existing Notion DB schema must match mapped fields.
- Existing Notion category and JAR config DBs must have `Name` title property.
- SePay webhook must send expected auth header format.
- Telegram webhook must send `X-Telegram-Bot-Api-Secret-Token`.
- Cloudflare KV namespace must be bound as `TELEGRAM_STATE`.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Missing/incorrect secrets | Requests fail | Validate secrets before deploy |
| Notion API limits/errors | Failed sync | Return retryable status and keep idempotent upsert |
| Schema mismatch in Notion DB | Write failures | Verify property names before go-live |
| Telegram duplicate callbacks | Duplicate user actions | KV state and idempotent missing-state handling |
| Long option lists | Large Telegram keyboards | Paginate later if category/JAR lists grow |

## Requirement History

| Date | Change |
|---|---|
| 2026-03-05 | Initial PDR created from Phase plan + scaffold |
| 2026-03-05 | Updated for phase-2 completion: webhook route/auth/validation/error handling implemented; phase-3 Notion upsert remains pending |
| 2026-03-05 | Updated for phase-3 completion: real Notion upsert implemented and tests now 18 passing |
| 2026-03-07 | Added JAR budget service, webhook budget linking, `POST /budget`, cron trigger, and tests expanded to 36 |
| 2026-07-02 | Added Telegram guided transaction input, KV state, webhook route, docs, and tests expanded to 120 |
