# Development Roadmap

Last updated: 2026-03-05
Project phase: Phase 4 active (Phase 3 completed)

## Milestone Summary

| Milestone | Progress | Status |
|---|---:|---|
| M1: Worker foundation | 100% | Completed |
| M2: SePay webhook handler | 100% | Completed |
| M3: Notion upsert engine | 100% | Completed |
| M4: Integration + deploy | 33% | In progress |

## Phase Plan

| Phase | Goal | Status | Notes |
|---|---|---|---|
| Phase 1 | Scaffold worker, deps, config, secrets | Completed | Worker scaffold + configs done in repo; runtime secrets still required before live deploy |
| Phase 2 | Webhook route + API key verify + payload parse | Completed | `POST /webhook`, auth/content-type/payload guards, tested status paths |
| Phase 3 | Notion query/create/update by transaction ID | Completed | `src/notion.ts` now resolves data source, queries by `Transaction ID`, updates matches, creates when none |
| Phase 4 | Error handling, deploy, end-to-end verify | In progress | Runtime error path + tests done; deploy/live webhook verification pending |

## Near-Term Next Actions

1. Run `wrangler dev` smoke flow with real secrets + sample payload.
2. Deploy Worker and configure SePay webhook URL to `/webhook`.
3. Validate live end-to-end write/update behavior in Notion.
4. Document production runbook + rollback steps.

## Success Metrics

- `npx tsc --noEmit` passes.
- `npm test -- --run` passes (18 tests).
- Valid webhook updates/creates Notion row by `Transaction ID` in unit/integration tests.
- Deployment endpoint reachable from SePay webhook configuration (pending Phase 4).
