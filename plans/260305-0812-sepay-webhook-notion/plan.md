---
title: SePay Webhook → Cloudflare Worker → Notion
status: in-progress
progress: 23
created: 2026-03-05
updated: 2026-03-05
brainstorm: plans/reports/brainstorm-260305-0812-sepay-webhook-notion.md
---

# SePay Webhook → Cloudflare Worker → Notion

## Overview

Cloudflare Worker that receives SePay payment webhooks, verifies `apikey` header, and upserts full transaction data into an existing Notion budget tracking database.

## Architecture

```
SePay → POST /webhook → CF Worker
                          ├── verify apikey header → 401 if fail
                          ├── parse JSON body
                          ├── query Notion by Transaction ID
                          └── insert or update Notion page → 200 OK
```

## Stack

- **Runtime:** Cloudflare Workers (TypeScript)
- **Deploy:** Wrangler CLI
- **Notion:** `@notionhq/client`
- **Secrets:** `NOTION_TOKEN`, `NOTION_DB_ID`, `SEPAY_API_KEY`

## Notion DB Mapping

| Notion Field    | Type   | SePay Source      |
|-----------------|--------|-------------------|
| Name (title)    | Title  | `content`         |
| Amount          | Number | `transferAmount`  |
| Type            | Select | `transferType`    |
| Date            | Date   | `transactionDate` |
| Account         | Text   | `accountNumber`   |
| Gateway         | Text   | `gateway`         |
| Transaction ID  | Text   | `id`              |
| Reference       | Text   | `referenceCode`   |
| Sub Account     | Text   | `subAccount`      |

## File Structure

```
src/
├── index.ts      # Worker entry point + routing
├── sepay.ts      # SePay types + apikey verification
└── notion.ts     # Notion query + upsert logic
wrangler.toml
package.json
```

## Phases

| Phase | Description | Status | Progress |
|-------|-------------|--------|----------|
| [Phase 1](./phase-01-project-setup.md) | Project setup (Wrangler, deps, secrets) | in-progress | 4/5 (80%) |
| [Phase 2](./phase-02-sepay-handler.md) | SePay webhook handler + verification | in-progress | 1/5 (20%) |
| [Phase 3](./phase-03-notion-upsert.md) | Notion query + upsert logic | pending | 0/6 (0%) |
| [Phase 4](./phase-04-integration-deploy.md) | Integration, error handling, deploy | pending | 0/6 (0%) |

## Dependencies

- Cloudflare account with Workers enabled
- Notion integration token (Internal Integration)
- Existing Notion DB ID with matching schema
- SePay account with webhook configured

## Risks

- Notion 3 req/sec limit — non-issue for budget tracking volume
- SePay retries on timeout — upsert is idempotent, handles gracefully

## Unresolved Questions

- Notion DB ID: must be configured as wrangler secret before deploy
- CF account subdomain for worker URL (needed for SePay webhook config)

## Validation Log

### Session 1 — 2026-03-05
**Trigger:** Pre-implementation validation interview
**Questions asked:** 6

#### Questions & Answers

1. **[Assumptions]** Does your existing Notion DB already have all required properties?
   - Options: Yes matches | No need to create | Partial missing
   - **Answer:** Yes, schema matches
   - **Rationale:** No extra DB setup step needed — implementation can proceed directly

2. **[Architecture]** What path should the webhook endpoint be on?
   - Options: POST / (root) | POST /webhook
   - **Answer:** POST /webhook
   - **Rationale:** Routing required in index.ts; SePay webhook URL must include `/webhook` path

3. **[Risks]** If Notion API is down, what should Worker respond to SePay?
   - Options: 500 → SePay retries | 200 → swallow error
   - **Answer:** 500 → SePay retries
   - **Rationale:** Upsert is idempotent — SePay retries are safe; no data loss

4. **[Assumptions]** Does SePay send transferType as lowercase or uppercase?
   - Options: lowercase "in"/"out" | uppercase "IN"/"OUT" | normalize in code
   - **Answer:** Uppercase "IN"/"OUT"
   - **Rationale:** Notion select options must be "IN"/"OUT" to match exactly

5. **[Architecture]** Use @notionhq/client SDK or native fetch in CF Workers?
   - Options: SDK + `nodejs_compat` flag | native fetch (no SDK)
   - **Answer:** @notionhq/client with `nodejs_compat` enabled
   - **Rationale:** Add Node.js compatibility flag in wrangler config for SDK compatibility

6. **[Architecture]** Worker name (becomes subdomain)?
   - Options: notion-budget-manager | sepay-webhook | custom
   - **Answer:** notion-budget-manager
   - **Rationale:** URL: `https://notion-budget-manager.{account}.workers.dev/webhook`

#### Confirmed Decisions
- Webhook path: `POST /webhook` — routing needed in index.ts
- Error strategy: 500 on Notion failure — SePay retries safely
- transferType: uppercase "IN"/"OUT" in Notion select options
- CF compat: `compatibility_flags = ["nodejs_compat"]` in wrangler.toml
- Worker name: `notion-budget-manager`
- Notion schema: already set up, no changes needed

#### Action Items
- [x] Update wrangler.toml with `compatibility_flags = ["nodejs_compat"]`
- [ ] Add URL routing in index.ts for `POST /webhook`
- [ ] Update SepayWebhookPayload type: `transferType: "IN" | "OUT"`
- [ ] Notion select options: "IN" and "OUT" (uppercase)

#### Impact on Phases
- Phase 1: Add `compatibility_flags = ["nodejs_compat"]` to wrangler.toml snippet
- Phase 2: Add path routing; update transferType type to "IN" | "OUT"; fix success criteria to use `/webhook`
- Phase 3: Update transferType in buildProperties to pass "IN"/"OUT" directly
