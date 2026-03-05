# Development Roadmap

Last updated: 2026-03-05
Project phase: Phase 3 active (Phase 2 completed)

## Milestone Summary

| Milestone | Progress | Status |
|---|---:|---|
| M1: Worker foundation | 100% | Completed |
| M2: SePay webhook handler | 100% | Completed |
| M3: Notion upsert engine | 17% | In progress |
| M4: Integration + deploy | 17% | In progress |

## Phase Plan

| Phase | Goal | Status | Notes |
|---|---|---|---|
| Phase 1 | Scaffold worker, deps, config, secrets | Completed | Worker scaffold + configs done in repo; runtime secrets still required before live deploy |
| Phase 2 | Webhook route + API key verify + payload parse | Completed | `POST /webhook`, auth/content-type/payload guards, tested status paths |
| Phase 3 | Notion query/create/update by transaction ID | In progress | Handler wiring exists; `src/notion.ts` still placeholder |
| Phase 4 | Error handling, deploy, end-to-end verify | In progress | `500` catch path exists; deploy/live webhook verification pending |

## Near-Term Next Actions

1. Implement real Notion query/create/update in `src/notion.ts`.
2. Add idempotent dedup logic by `Transaction ID`.
3. Run `wrangler dev` smoke flow with real secrets + sample payload.
4. Deploy Worker and configure SePay webhook URL to `/webhook`.

## Success Metrics

- `npx tsc --noEmit` passes.
- `npm test -- --run` passes (11 tests).
- Valid webhook updates/creates Notion row after Phase 3 implementation.
- Deployment endpoint is reachable from SePay webhook configuration.
