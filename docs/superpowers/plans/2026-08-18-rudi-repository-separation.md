# RUDI Repository Separation Implementation Plan

> **For agentic workers:** Execute this migration without triggering Vercel until the user explicitly approves deployment.

**Goal:** Make `rst4231/rudi` a self-contained source for `spb-daily-guide-bot` and remove the remaining RUDI coupling from `rst4231/botsandsite` in one final traffic-news deployment.

**Architecture:** Copy the known-good runtime chunks pinned to `botsandsite` commit `64bf5d7737e81e3e23c4ec88e641e774fc79b58c` into `rst4231/rudi`. A local build step concatenates, decodes, and gunzips those chunks into a CommonJS runtime module; `api/index.js` loads that local module only. `botsandsite` cleanup is deferred until deployment approval because that repository is still connected to Vercel.

**Tech Stack:** Node.js 24, Vercel Functions, GitHub Actions, CommonJS.

**Spec:** `docs/superpowers/specs/2026-08-18-rudi-repository-separation-design.md`

## Global Constraints

- No Vercel deployment before the user explicitly approves `Деплоим?`.
- `rst4231/rudi` must contain no runtime reference to `rst4231/botsandsite` after migration.
- Preserve RUDI routes: `/api/daily`, `/api/health`, `/api/telegram`, `/api/alice-shopping`, `/api/init-products`, `/api/preview`.
- Preserve RUDI cron: `/api/daily` at `30 21 * * *`.
- Preserve traffic-news cron: `/api/cron/publish` at `40 15 * * *`.

### Task 1: Import and validate pinned runtime

**Files:**
- Create: `runtime/chunk0.txt` ... `runtime/chunk6.txt`
- Temporary automation: `.github/workflows/import-runtime.yml`

- [ ] Import exactly seven chunks from pinned commit `64bf5d7737e81e3e23c4ec88e641e774fc79b58c`.
- [ ] Verify expected sizes: 9000 bytes for chunks 0-5 and 7364 bytes for chunk 6.
- [ ] Concatenate, base64-decode and gunzip; verify the result parses with `node --check`.

### Task 2: Add self-contained build and API entrypoint

**Files:**
- Create: `build.cjs`
- Create: `api/index.js`
- Create: `package.json`
- Create: `vercel.json`
- Create: `.gitignore`
- Create: `tests/runtime.test.cjs`

- [ ] Test that seven local chunks exist and decode successfully.
- [ ] Build `runtime/generated-runtime.cjs` from local chunks only.
- [ ] Test that the generated module exports a function.
- [ ] Route all RUDI endpoints to `api/index.js` with the original `route` query values.
- [ ] Keep only the RUDI daily cron.

### Task 3: Verify repository independence

- [ ] Search tracked source/config for `rst4231/botsandsite`, `traffic-news-telegram-bot`, `prj_oeVaHSb17REkd4rZGsJrRIybPRG7`, and `[rudi]`; production code/config must contain none of them.
- [ ] Validate `package.json` and `vercel.json` as JSON.
- [ ] Run `npm test` and `npm run build` in GitHub Actions.

### Task 4: Prepare botsandsite cleanup for the final approved deployment

**Files to remove/change after approval:**
- Remove: `api/rudi.js`
- Remove: `rudi-runtime-20260817/`
- Remove: `scripts/vercel-project-mode.cjs`
- Modify: root `vercel.json` so it is traffic-news-only and keeps `/api/cron/publish` at `40 15 * * *`.

- [ ] Do not push this cleanup while `botsandsite` is connected to Vercel and deployment has not been approved.
- [ ] After approval, apply cleanup as one commit so it produces at most one intended traffic-news deployment.
