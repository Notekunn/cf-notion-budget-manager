# notion-budget-manager

Cloudflare Worker that ingests SePay payment webhooks, syncs transactions to Notion, automates JAR-based monthly budgeting, and sends daily subscription renewal alerts via Telegram.

## Features

- **Webhook receiver** — `POST /webhook` ingests SePay payment notifications, upserts transactions in Notion (deduped by Transaction ID)
- **Telegram transaction input** — new SePay transactions can be enriched from Telegram with guided Name → Category → JAR confirmation
- **Monthly budgets** — `POST /budget` + monthly cron creates budget pages with per-JAR formula columns synced from a config DB
- **Subscription alerts** — `POST /subscription-alerts` + daily cron queries active subscriptions from Notion, sends Telegram alerts for upcoming renewals and expiring trials
- **Embedded charts** — `GET /charts/*` serves Chart.js HTML pages (trends, categories, budget, dashboard), embeddable in Notion via iframe
- **API key auth** on all POST routes; query param `?key=xxx` on GET chart routes for iframe embeds

## Tech Stack

- **Runtime:** Cloudflare Workers
- **Language:** TypeScript (strict)
- **Database:** Notion (via `@notionhq/client`)
- **Notifications:** Telegram Bot API
- **Testing:** Vitest + `@cloudflare/vitest-pool-workers`
- **Deploy:** Wrangler

## Setup

```bash
npm install
```

### Secrets

Set via Wrangler:

```bash
wrangler secret put NOTION_TOKEN
wrangler secret put NOTION_DB_ID
wrangler secret put NOTION_BUDGET_DB_ID
wrangler secret put NOTION_JARS_CONFIG_DB_ID
wrangler secret put NOTION_SUBSCRIPTION_DB_ID
wrangler secret put NOTION_CATEGORY_DB_ID
wrangler secret put SEPAY_API_KEY
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

Create a `TELEGRAM_STATE` KV namespace and replace the placeholder ids in `wrangler.toml`.

## Development

```bash
npm run dev      # local dev server
npm test         # run tests
npm run deploy   # deploy to Cloudflare
```

## Routes

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/webhook` | SePay payment webhook receiver | API key |
| POST | `/telegram/webhook` | Telegram Bot API callback/text webhook | `X-Telegram-Bot-Api-Secret-Token` |
| POST | `/budget` | Create/ensure monthly budget (optional `{ "month": "YYYY-MM" }`) | API key |
| POST | `/subscription-alerts` | Trigger subscription alert check | API key |
| GET | `/charts/trends` | Monthly income vs spending bar chart | `?key=xxx` |
| GET | `/charts/categories` | Spending by JAR category doughnut chart | `?key=xxx` |
| GET | `/charts/budget` | Budget vs actual per JAR grouped bar | `?key=xxx` |
| GET | `/charts/dashboard` | All charts combined | `?key=xxx` |

SePay/internal POST routes require `Authorization` header with API key. Telegram webhook uses Telegram secret-token header. GET chart routes use query param auth for Notion embed URLs.

## Cron Triggers

| Schedule | Action |
|---|---|
| `0 0 1 * *` | Create monthly budget for current month |
| `0 0 * * *` | Check subscriptions and send Telegram alerts |
