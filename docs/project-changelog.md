# Project Changelog

## 2026-03-05

### Added

- Initial Cloudflare Worker scaffold with TypeScript.
- Worker entrypoint at `src/index.ts`.
- Vitest worker test scaffold under `test/`.
- Planning docs for 4-phase implementation.

### Changed

- `wrangler.toml` configured with:
  - `name = "notion-budget-manager"`
  - `main = "src/index.ts"`
  - `compatibility_date = "2026-03-01"`
  - `compatibility_flags = ["nodejs_compat"]`
- Runtime dependency `@notionhq/client` added.

### Pending Follow-ups

- Set Cloudflare secrets for Notion + SePay.
- Replace `Hello World` handler with `POST /webhook` flow.
- Implement Notion upsert logic.
