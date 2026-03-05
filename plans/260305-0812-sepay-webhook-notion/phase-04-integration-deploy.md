# Phase 4: Integration, Error Handling & Deploy

**Status:** pending
**Priority:** high
**Effort:** ~30min
**Blocked by:** Phase 3

## Overview

Wire all modules together, add error handling, deploy to Cloudflare, configure SePay webhook URL.

## Error Handling in `src/index.ts`

```typescript
try {
  await upsertTransaction(payload, env);
} catch (err) {
  console.error("Notion upsert failed:", err);
  // Return 500 so SePay retries — upsert is idempotent
  return new Response("Internal Server Error", { status: 500 });
}
```

## Final `src/index.ts` Structure

```
fetch()
  ├── method check → 405
  ├── verifyApiKey() → 401
  ├── request.json() → 400
  ├── upsertTransaction() → 500 on error
  └── 200 OK { success: true }
```

## Deploy

```bash
# Deploy to Cloudflare
wrangler deploy

# Worker URL format:
# https://notion-budget-manager.<your-subdomain>.workers.dev
```

## Configure SePay Webhook

In SePay dashboard → Webhook settings:
- **URL:** `https://notion-budget-manager.<subdomain>.workers.dev`
- **Method:** POST
- **API Key:** same value as `SEPAY_API_KEY` secret

SePay sends `Authorization: Apikey <key>` header with each request.

## Smoke Test

```bash
# Test locally with wrangler dev
curl -X POST http://localhost:8787 \
  -H "Authorization: Apikey <your-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": 12345,
    "gateway": "MBBank",
    "transactionDate": "2026-03-05 10:00:00",
    "accountNumber": "0123456789",
    "subAccount": null,
    "code": "TEST001",
    "content": "Test transaction",
    "transferType": "in",
    "transferAmount": 100000,
    "accumulated": 100000,
    "referenceCode": "REF001",
    "description": "Test"
  }'

# Expected: {"success":true} + new row in Notion DB
# Send again → same row updated, no duplicate
```

## Files to Modify

- `src/index.ts` — add try/catch around `upsertTransaction`, finalize all imports

## Todo

- [ ] Add try/catch error handling in `src/index.ts`
- [ ] Run `wrangler dev` + smoke test with curl
- [ ] Verify Notion row created + duplicate handling works
- [ ] Run `wrangler deploy`
- [ ] Configure SePay webhook URL in SePay dashboard
- [ ] Send test webhook from SePay dashboard and verify end-to-end

## Success Criteria

- Worker deployed and accessible at workers.dev URL
- SePay webhook configured and pointing to worker URL
- Real SePay webhook creates/updates Notion row correctly
- Errors logged to Cloudflare dashboard (Workers → Logs)

## Post-Deploy Monitoring

- Cloudflare Workers dashboard → Real-time logs
- Check for repeated 500s (Notion API issues)
- Check for 401s (apikey mismatch)
