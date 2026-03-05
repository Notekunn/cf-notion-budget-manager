# Project Overview + PDR

Last updated: 2026-03-05
Version: 0.1.0-phase-1

## Project Overview

`notion-budget-manager` is a Cloudflare Worker project intended to receive SePay webhook events and sync transactions into a Notion database.

Current implemented state (verified in code):
- Worker scaffold exists.
- `src/index.ts` returns `Hello World!`.
- `wrangler.toml` configured with `nodejs_compat`.
- Notion SDK dependency installed.

## Product Scope

In scope:
- Webhook receiver on Cloudflare Workers.
- API key verification using SePay key.
- Notion upsert by transaction ID.

Out of scope (for now):
- Extra storage layer (KV, D1, Queue).
- Admin UI/dashboard.
- Multi-provider payment ingestion.

## Functional Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-1 | Worker scaffold with Wrangler + TypeScript | In progress (mostly done) |
| FR-2 | Runtime secrets defined in worker Env interface are configured in Cloudflare | Pending |
| FR-3 | `POST /webhook` route handling | Pending |
| FR-4 | Verify inbound API key auth header | Pending |
| FR-5 | Parse SePay JSON payload | Pending |
| FR-6 | Upsert transaction in Notion DB by `Transaction ID` | Pending |
| FR-7 | Return status codes for auth/body/upsert failures | Pending |

## Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-1 | Runtime | Cloudflare Workers |
| NFR-2 | Language | TypeScript strict mode |
| NFR-3 | Idempotency | Duplicate webhook should not create duplicate Notion rows |
| NFR-4 | Security | Secrets stored in Wrangler secrets, not source |
| NFR-5 | Reliability | On Notion failure, return non-2xx so sender can retry |

## Acceptance Criteria

Phase 1 done when:
1. `wrangler dev` starts without error.
2. `wrangler.toml` has `compatibility_flags = ["nodejs_compat"]`.
3. Required secrets are set in Cloudflare.

Overall product done when:
1. Valid `POST /webhook` updates/creates a Notion row.
2. Invalid API key returns `401`.
3. Malformed JSON returns `400`.
4. Notion failures return `500`.

## Constraints + Dependencies

- Cloudflare account + Wrangler auth required.
- Existing Notion DB schema must match mapped fields.
- SePay webhook must send expected auth header format.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Missing/incorrect secrets | Requests fail | Validate secrets before deploy |
| Notion API limits/errors | Failed sync | Return retryable status and keep idempotent upsert |
| Schema mismatch in Notion DB | Write failures | Verify property names before go-live |

## Requirement History

| Date | Change |
|---|---|
| 2026-03-05 | Initial PDR created from Phase plan + scaffold |
