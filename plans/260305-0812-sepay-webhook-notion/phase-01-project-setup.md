# Phase 1: Project Setup

**Status:** in-progress
**Priority:** high
**Effort:** ~30min

## Overview

Initialize Cloudflare Worker project with TypeScript, Wrangler, and required dependencies.

## Requirements

- Wrangler CLI installed globally (`npm i -g wrangler`)
- CF account logged in (`wrangler login`)
- Node.js 18+

## Implementation Steps

1. **Init Wrangler project**
   ```bash
   cd notion-budget-manager
   npm create cloudflare@latest . -- --type=hello-world --lang=ts --no-git
   ```

2. **Install Notion SDK**
   ```bash
   npm install @notionhq/client
   ```

3. **Configure `wrangler.toml`**
   <!-- Updated: Validation Session 1 - node_compat required for @notionhq/client -->
   ```toml
   name = "notion-budget-manager"
   main = "src/index.ts"
   compatibility_date = "2026-03-01"
   compatibility_flags = ["nodejs_compat"]

   [vars]
   # non-secret config here if needed
   ```

4. **Set secrets via Wrangler**
   ```bash
   wrangler secret put NOTION_TOKEN      # Notion integration token
   wrangler secret put NOTION_DB_ID      # Target Notion database ID
   wrangler secret put SEPAY_API_KEY     # SePay webhook apikey
   ```

5. **Configure `tsconfig.json`** — ensure `lib` includes `WebWorker` types for CF Workers env

## Files to Create

- `wrangler.toml`
- `package.json` (auto-generated)
- `tsconfig.json` (auto-generated, adjust if needed)
- `src/index.ts` (stub)

## Todo

- [x] Run `npm create cloudflare` to scaffold project
- [x] Install `@notionhq/client`
- [x] Verify `wrangler.toml` config
- [ ] Set all 3 secrets via `wrangler secret put`
- [x] Run `wrangler dev` to confirm worker starts

## Success Criteria

- `wrangler dev` starts without errors
- All 3 secrets set in Cloudflare dashboard
