# Phase 2: SePay Webhook Handler + Verification

**Status:** in-progress
**Priority:** high
**Effort:** ~45min
**Blocked by:** Phase 1

## Overview

Implement `src/sepay.ts` (types + apikey verification) and the main Worker entry in `src/index.ts`.

## SePay Webhook Payload

```typescript
// Full transaction payload from SePay
interface SepayTransaction {
  id: number;                // unique transaction ID (dedup key)
  gateway: string;           // bank name e.g. "MBBank"
  transactionDate: string;   // "YYYY-MM-DD HH:mm:ss"
  accountNumber: string;     // bank account number
  subAccount: string | null; // sub-account
  code: string | null;       // transfer code
  content: string;           // transfer description (→ Notion title)
  transferType: "IN" | "OUT"; // SePay sends uppercase
  transferAmount: number;    // amount in VND
  accumulated: number;       // running total
  referenceCode: string;     // bank reference
  description: string;       // additional description
}

// <!-- Updated: Validation Session 1 - transferType is uppercase "IN"/"OUT" -->
interface SepayWebhookPayload {
  id: number;
  gateway: string;
  transactionDate: string;
  accountNumber: string;
  subAccount: string | null;
  code: string | null;
  content: string;
  transferType: "IN" | "OUT"; // SePay sends uppercase
  transferAmount: number;
  accumulated: number;
  referenceCode: string;
  description: string;
}
```

## Signature Verification

SePay sends `Authorization: Apikey <YOUR_API_KEY>` header.

```typescript
// src/sepay.ts
function verifyApiKey(request: Request, expectedKey: string): boolean {
  const auth = request.headers.get("Authorization") ?? "";
  // Format: "Apikey <key>"
  const [scheme, key] = auth.split(" ");
  return scheme === "Apikey" && key === expectedKey;
}
```

## Worker Entry (`src/index.ts`)

<!-- Updated: Validation Session 1 - route to POST /webhook, not root -->
```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Only handle POST /webhook
    if (request.method !== "POST" || url.pathname !== "/webhook") {
      return new Response("Not Found", { status: 404 });
    }

    // Verify apikey
    if (!verifyApiKey(request, env.SEPAY_API_KEY)) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Parse body
    let payload: SepayWebhookPayload;
    try {
      payload = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    // Upsert to Notion (Phase 3)
    await upsertTransaction(payload, env);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
};
```

## Env Interface

```typescript
// src/index.ts
interface Env {
  NOTION_TOKEN: string;
  NOTION_DB_ID: string;
  SEPAY_API_KEY: string;
}
```

## Files to Create/Modify

- `src/index.ts` — Worker entry, routing, env interface
- `src/sepay.ts` — SepayWebhookPayload type + verifyApiKey()

## Todo

- [ ] Create `src/sepay.ts` with types + `verifyApiKey()`
- [ ] Create `src/index.ts` with fetch handler
- [x] Define `Env` interface
- [ ] Test 401 on wrong apikey with `wrangler dev`
- [ ] Test 400 on malformed body

## Success Criteria

<!-- Updated: Validation Session 1 - path is /webhook not / -->
- `POST /webhook` with wrong apikey → 401
- `POST /webhook` with malformed body → 400
- `POST /webhook` with valid apikey + body → reaches upsert step (Phase 3)
- `GET /webhook` or any other path → 404
