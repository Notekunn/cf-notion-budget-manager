# Codebase Summary

Generated: 2026-07-02
Source: manual code review

## Repo Snapshot

- Total source files: 15 (`src/`)
- Main runtime: Cloudflare Workers + TypeScript
- Main deploy tool: Wrangler
- Main integrations: Notion API, SePay webhooks, Telegram Bot API

## Current Implementation State

- Worker compiles with strict TypeScript + Worker types.
- Routes: `POST /webhook`, `POST /telegram/webhook`, `POST /budget`, `POST /subscription-alerts`, `GET /charts/*`, plus cron `scheduled` handler.
- Request pipeline: API key check → payload/month validation → Notion operations.
- Notion integration:
  - Tx upsert + dedup by `Transaction ID`
  - Tx-to-monthly-budget linking
  - Dynamic budget DB formula/property sync from JAR config DB
  - Tx detail enrichment for `Name`, `Category`, and `JAR`
  - Subscription DB query for active/trial subscriptions
- Telegram transaction input: SePay success schedules an Input prompt; Telegram webhook stores one active tx per chat in KV and confirms/cancels Notion enrichment.
- Subscription alerts: daily cron queries Notion subscription DB, filters by renewal/trial dates, sends Telegram alerts.
- Cron triggers: `0 0 1 * *` (monthly budget), `0 0 * * *` (daily subscription alerts).
- Test suite passes (`120` tests).

## Key Files

| File | Purpose |
|---|---|
| `src/index.ts` | Webhook + budget + subscription-alerts routes + scheduled orchestration |
| `src/sepay.ts` | SePay payload typing, payload guard, API key verification |
| `src/notion.ts` | Notion tx upsert + budget linking |
| `src/notion-client.ts` | Shared Notion client + data-source-id resolution |
| `src/notion-helpers.ts` | Shared Notion property extraction helpers (title, number) |
| `src/budget-service.ts` | JAR budget schema sync + monthly budget ops |
| `src/category-service.ts` | Notion category option lookup |
| `src/subscription-alert.ts` | Subscription fetch, alert filtering, Telegram message formatting |
| `src/telegram.ts` | Telegram Bot API send/callback/delete helpers |
| `src/telegram-state.ts` | KV-backed active transaction state |
| `src/telegram-bot.ts` | Telegram transaction input state machine |
| `wrangler.toml` | Worker runtime/deploy config + cron triggers |
| `package.json` | Scripts + dependencies |
| `tsconfig.json` | Strict TS compiler settings |
| `vitest.config.mts` | Test config for worker pool |
| `test/index.spec.ts` | Unit + integration webhook tests |
| `test/notion-upsert.spec.ts` | Notion upsert behavior tests |

## Environment Keys (Expected)

| Key | Purpose |
|---|---|
| `NOTION_TOKEN` | Notion API auth |
| `NOTION_DB_ID` | Transaction database ID |
| `NOTION_BUDGET_DB_ID` | Monthly budget database ID |
| `NOTION_JARS_CONFIG_DB_ID` | JAR config database ID |
| `NOTION_SUBSCRIPTION_DB_ID` | Subscription database ID |
| `NOTION_CATEGORY_DB_ID` | Category database ID |
| `SEPAY_API_KEY` | Inbound webhook auth |
| `TELEGRAM_BOT_TOKEN` | Telegram bot for alerts |
| `TELEGRAM_CHAT_ID` | Telegram chat target |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram webhook secret-token verification |
| `TELEGRAM_STATE` | Cloudflare KV binding for active tx state |

## Remaining Scope

- Validate live Notion Formula 2.0 expressions in workspace.
- Set Telegram webhook to deployed `POST /telegram/webhook`.
- Replace `TELEGRAM_STATE` KV placeholder ids in `wrangler.toml`.
- Validate end-to-end webhook + budget flow on deployed Worker URL.
- Add deploy/rollback runbook for operations.

## Technical Notes

- `wrangler.toml`: `compatibility_flags = ["nodejs_compat"]`, two cron triggers.
- `@notionhq/client` v5.4.0 used; data source queries via `notion.dataSources.query()`.
- Vietnam timezone (UTC+7) used for subscription alert date calculations.
- Telegram callback/text flow deletes tracked messages best-effort after confirm/cancel.
