# notion-budget-manager

Cloudflare Worker that ingests SePay payment webhooks, syncs transactions to Notion, automates JAR-based monthly budgeting, and sends daily subscription renewal alerts via Telegram.

## Features

- **Webhook receiver** — `POST /webhook` ingests SePay payment notifications, upserts transactions in Notion (deduped by Transaction ID)
- **Monthly budgets** — `POST /budget` + monthly cron creates budget pages with per-JAR formula columns synced from a config DB
- **Subscription alerts** — `POST /subscription-alerts` + daily cron queries active subscriptions from Notion, sends Telegram alerts for upcoming renewals and expiring trials
- **API key auth** on all POST routes

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
wrangler secret put SEPAY_API_KEY
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
```

## Development

```bash
npm run dev      # local dev server
npm test         # run tests
npm run deploy   # deploy to Cloudflare
```

## Routes

| Method | Path | Description |
|---|---|---|
| POST | `/webhook` | SePay payment webhook receiver |
| POST | `/budget` | Create/ensure monthly budget (optional `{ "month": "YYYY-MM" }`) |
| POST | `/subscription-alerts` | Trigger subscription alert check |

All routes require `Authorization` header with SePay API key.

## Cron Triggers

| Schedule | Action |
|---|---|
| `0 0 1 * *` | Create monthly budget for current month |
| `0 0 * * *` | Check subscriptions and send Telegram alerts |
