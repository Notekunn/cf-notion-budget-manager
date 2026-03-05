# Brainstorm: SePay Webhook → Cloudflare Worker → Notion

**Date:** 2026-03-05
**Status:** Agreed

## Problem Statement

Build a Cloudflare Worker webhook endpoint that:
- Receives SePay payment webhooks
- Verifies `apikey` header signature
- Upserts (insert or update) full transaction data into existing Notion budget tracking DB

## Evaluated Approaches

### Option A: Pure Stateless CF Worker ✅ CHOSEN
- Verify → Query Notion by txn_id → Upsert
- Zero extra infra, free tier sufficient
- 2 Notion API calls per webhook (acceptable at budget tracking volume)

### Option B: CF Worker + KV Cache
- KV for fast dedup, then Notion upsert
- Overkill for low-volume budget tracking

### Option C: CF Worker + Queues
- Over-engineered for this use case

## Final Solution

**Stack:** Cloudflare Workers (TypeScript) + Wrangler + @notionhq/client

**Security:** `apikey` header verification against `SEPAY_API_KEY` secret

**Dedup key:** SePay `id` field → Notion `Transaction ID` property

## Notion DB Field Mapping

| Notion Field | Type | SePay Source |
|---|---|---|
| Name | Title | `content` |
| Amount | Number | `transferAmount` |
| Type | Select | `transferType` |
| Date | Date | `transactionDate` |
| Account | Text | `accountNumber` |
| Gateway | Text | `gateway` |
| Transaction ID | Text | `id` |
| Reference | Text | `referenceCode` |
| Sub Account | Text | `subAccount` |

## File Structure

```
notion-budget-manager/
├── src/
│   ├── index.ts     # Worker entry + routing
│   ├── sepay.ts     # Types + signature verify
│   └── notion.ts    # Upsert logic
├── wrangler.toml
└── package.json
```

## Implementation Flow

1. POST /webhook received
2. Verify apikey header → 401 if fail
3. Parse SePay body
4. Query Notion: filter Transaction ID == id
5. Found → update page; Not found → create page
6. Return 200 OK

## Risks

- Notion 3 req/sec rate limit — non-issue for budget tracking
- SePay may retry on timeout — upsert pattern handles gracefully

## Unresolved Questions

- What's the existing Notion DB ID? (need for wrangler secrets config)
- Does user want the Notion DB created/schema set up as part of implementation, or is schema already defined?
- Any specific Cloudflare account / Workers subdomain to deploy to?
