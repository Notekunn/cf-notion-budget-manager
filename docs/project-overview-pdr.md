# Project Overview + PDR

Last updated: 2026-03-05
Version: 0.3.0-phase-3

## Project Overview

`notion-budget-manager` is a Cloudflare Worker project intended to receive SePay webhook events and sync transactions into a Notion database.

Current implemented state (verified in code):
- Worker scaffold exists with strict TypeScript + Wrangler config.
- `src/index.ts` handles `POST /webhook` only.
- API key, content-type, JSON parse, and payload shape validation are implemented.
- `upsertTransaction(payload, env)` is wired and guarded with `500` catch.
- `src/notion.ts` implements real Notion upsert:
  - resolve data source id from data source id or database id
  - query existing rows by `Transaction ID` (paginated)
  - update all matches or create when no match
  - serialize concurrent upserts by transaction id in memory
- Test suite passes (`18` tests).

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
| FR-1 | Worker scaffold with Wrangler + TypeScript | Completed |
| FR-2 | Runtime secrets defined in worker Env interface are configured in Cloudflare | Pending runtime verification |
| FR-3 | `POST /webhook` route handling | Completed |
| FR-4 | Verify inbound API key auth header | Completed |
| FR-5 | Parse + validate SePay JSON payload | Completed |
| FR-6 | Upsert transaction in Notion DB by `Transaction ID` | Completed |
| FR-7 | Return status codes for auth/body/upsert failures | Completed |
| FR-8 | Automated tests for webhook route/status contract | Completed (18 passing tests) |

## Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-1 | Runtime | Cloudflare Workers |
| NFR-2 | Language | TypeScript strict mode |
| NFR-3 | Idempotency | Duplicate webhook should not create duplicate Notion rows |
| NFR-4 | Security | Secrets stored in Wrangler secrets, not source |
| NFR-5 | Reliability | On Notion failure, return non-2xx so sender can retry |

## Acceptance Criteria

Phase 3 done when:
1. `POST /webhook` with wrong API key returns `401`.
2. `POST /webhook` with malformed or invalid body returns `400`.
3. Non-`POST /webhook` requests return `404`.
4. Downstream upsert failure returns `500`.
5. Valid request returns `200` with `{ "success": true }`.
6. Upsert updates existing Notion rows by `Transaction ID`.
7. Upsert creates new Notion row when `Transaction ID` is missing.

Overall product done when:
1. Valid `POST /webhook` updates/creates a Notion row in deployed environment.
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
| 2026-03-05 | Updated for phase-2 completion: webhook route/auth/validation/error handling implemented; phase-3 Notion upsert remains pending |
| 2026-03-05 | Updated for phase-3 completion: real Notion upsert implemented and tests now 18 passing |
