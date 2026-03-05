# Development Roadmap

Last updated: 2026-03-05
Project phase: Phase 1 active

## Milestone Summary

| Milestone | Progress | Status |
|---|---:|---|
| M1: Worker foundation | 80% | In progress |
| M2: SePay webhook handler | 0% | Pending |
| M3: Notion upsert engine | 0% | Pending |
| M4: Integration + deploy | 0% | Pending |

## Phase Plan

| Phase | Goal | Status | Notes |
|---|---|---|---|
| Phase 1 | Scaffold worker, deps, config, secrets | In progress | Scaffold/config done; secrets still pending |
| Phase 2 | Webhook route + API key verify + payload parse | Pending | Blocked by Phase 1 completion |
| Phase 3 | Notion query/create/update by transaction ID | Pending | Depends on Phase 2 |
| Phase 4 | Error handling, deploy, end-to-end verify | Pending | Depends on Phase 3 |

## Near-Term Next Actions

1. Set the three required Cloudflare secrets declared in `src/index.ts`.
2. Implement `POST /webhook` path logic in `src/index.ts`.
3. Add `src/sepay.ts` and `src/notion.ts`.
4. Extend tests for auth/body/error paths.

## Success Metrics

- Local dev worker runs without config/runtime errors.
- Webhook request with valid key updates/creates Notion row.
- Duplicate webhook does not create duplicate Notion records.
- Deployment reachable from SePay webhook endpoint.
