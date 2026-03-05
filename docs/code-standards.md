# Code Standards

Last updated: 2026-03-05

## Codebase Structure

```text
src/
  index.ts                  # Worker entry
test/
  index.spec.ts             # Worker tests
  env.d.ts
  tsconfig.json
plans/                      # planning artifacts
wrangler.toml               # worker runtime config
tsconfig.json               # TS config for worker code
vitest.config.mts           # test runner config
```

Rules:
- Keep business logic in `src/` modules, not in `wrangler.toml`.
- Keep test-only typing/config under `test/`.

## TypeScript Standards

- `strict: true` required.
- Keep `moduleResolution: Bundler`.
- Worker runtime libs must include the Cloudflare worker web runtime library set.
- Avoid `any`; prefer explicit interfaces/types.

## File + Naming Standards

- Use kebab-case for new file names where practical.
- Keep files focused; split when logic grows.
- Export only what is needed by other modules.

## Worker/API Standards

- Route by method + pathname first.
- Validate auth before parsing body when possible.
- Return explicit status codes with plain, predictable response bodies.

Planned route contract:
- `POST /webhook` (primary ingestion endpoint)

## Error Handling Standards

- Use `try/catch` around external API calls.
- Never expose secret values in responses/logs.
- Return retryable error (`5xx`) for transient downstream failures.

## Security Standards

- Never commit tokens/API keys.
- Use Wrangler secrets for all sensitive values.
- Validate required env vars on startup or first request path.

## Testing Standards

- Keep fast unit-style tests for handler behavior.
- Keep integration-style tests for worker runtime path.
- Add negative-path tests for auth/body/error responses.

## Dependency Standards

- Pin major versions in `package.json`.
- Prefer minimal runtime dependencies.
- Keep dev tooling in `devDependencies`.

## Documentation Sync Rules

After config/runtime/route changes:
1. Update [`project-overview-pdr.md`](./project-overview-pdr.md)
2. Update [`system-architecture.md`](./system-architecture.md)
3. Append entry in [`project-changelog.md`](./project-changelog.md)
4. Update phase status in [`development-roadmap.md`](./development-roadmap.md)
