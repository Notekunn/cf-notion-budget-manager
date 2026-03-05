# Phase 3: Notion Query + Upsert Logic

**Status:** pending
**Priority:** high
**Effort:** ~1hr
**Blocked by:** Phase 2

## Overview

Implement `src/notion.ts` — query Notion DB by Transaction ID, then insert or update page.

## Notion API Notes

- Notion SDK: `@notionhq/client`
- No native upsert — must query first, then create or update
- Rate limit: 3 req/sec (2 calls per webhook = fine)
- `transactionDate` from SePay: `"YYYY-MM-DD HH:mm:ss"` → Notion Date: ISO 8601 `"YYYY-MM-DDTHH:mm:ss+07:00"`

## Notion DB Schema Required

The existing Notion DB must have these properties (exact names):

| Property Name  | Notion Type | Notes                    |
|----------------|-------------|--------------------------|
| Name           | title       | Auto-exists in all DBs   |
| Amount         | number      |                          |
| Type           | select      | Options: "IN", "OUT" (uppercase — matches SePay) |
<!-- Updated: Validation Session 1 - SePay sends uppercase transferType -->
| Date           | date        |                          |
| Account        | rich_text   |                          |
| Gateway        | rich_text   |                          |
| Transaction ID | rich_text   | Dedup key                |
| Reference      | rich_text   |                          |
| Sub Account    | rich_text   |                          |

## Implementation

```typescript
// src/notion.ts
import { Client } from "@notionhq/client";
import type { SepayWebhookPayload } from "./sepay";

// Build Notion page properties from SePay payload
function buildProperties(tx: SepayWebhookPayload) {
  // Parse "YYYY-MM-DD HH:mm:ss" → ISO 8601 with VN timezone
  const isoDate = tx.transactionDate.replace(" ", "T") + "+07:00";

  return {
    Name: {
      title: [{ text: { content: tx.content || `Transaction ${tx.id}` } }],
    },
    Amount: { number: tx.transferAmount },
    Type: { select: { name: tx.transferType } },
    Date: { date: { start: isoDate } },
    Account: { rich_text: [{ text: { content: tx.accountNumber } }] },
    Gateway: { rich_text: [{ text: { content: tx.gateway } }] },
    "Transaction ID": { rich_text: [{ text: { content: String(tx.id) } }] },
    Reference: { rich_text: [{ text: { content: tx.referenceCode ?? "" } }] },
    "Sub Account": { rich_text: [{ text: { content: tx.subAccount ?? "" } }] },
  };
}

// Query Notion DB for existing page by Transaction ID
async function findExistingPage(
  notion: Client,
  dbId: string,
  txId: number
): Promise<string | null> {
  const res = await notion.databases.query({
    database_id: dbId,
    filter: {
      property: "Transaction ID",
      rich_text: { equals: String(txId) },
    },
    page_size: 1,
  });
  return res.results.length > 0 ? res.results[0].id : null;
}

// Main upsert function — called from index.ts
export async function upsertTransaction(
  tx: SepayWebhookPayload,
  env: { NOTION_TOKEN: string; NOTION_DB_ID: string }
): Promise<void> {
  const notion = new Client({ auth: env.NOTION_TOKEN });
  const properties = buildProperties(tx);

  const existingPageId = await findExistingPage(notion, env.NOTION_DB_ID, tx.id);

  if (existingPageId) {
    // Update existing page
    await notion.pages.update({
      page_id: existingPageId,
      properties,
    });
  } else {
    // Create new page
    await notion.pages.create({
      parent: { database_id: env.NOTION_DB_ID },
      properties,
    });
  }
}
```

## Files to Create

- `src/notion.ts` — `buildProperties()`, `findExistingPage()`, `upsertTransaction()`

## Todo

- [ ] Create `src/notion.ts` with all three functions
- [ ] Export `upsertTransaction` and import in `src/index.ts`
- [ ] Handle edge cases: empty `content`, null `referenceCode`, null `subAccount`
- [ ] Test with sample SePay payload via `wrangler dev` + curl
- [ ] Verify page created in Notion DB
- [ ] Test duplicate: send same payload twice → verify no duplicate row

## Success Criteria

- First webhook → new Notion page created with all fields
- Second identical webhook → existing page updated (no duplicate)
- Null fields handled gracefully (empty string fallback)

## Error Handling

- Wrap `upsertTransaction` in try/catch in `index.ts` → return 500 on Notion error
- SePay will retry on non-2xx → idempotent upsert means safe to retry
