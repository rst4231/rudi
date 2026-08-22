# Products and Holidays Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shared products list fail-safe across Vercel serverless invocations, show the last updater, remove the phantom chicken-mince seed, and keep only the newest Holidays post.

**Architecture:** Add a strict Vercel Runtime Cache adapter and reuse it for replicated product state and holiday rollover tracking. Preserve current generated-runtime behavior, but refuse to mutate products when durable state cannot be read safely. Add output decoration for updater identity and post-success holiday replacement.

**Tech Stack:** Node.js CommonJS, Vercel Functions Runtime Cache protocol, Telegram Bot API, node:test.

**Spec:** `docs/superpowers/specs/2026-08-22-products-and-holidays-reliability-design.md`

## Global Constraints

- Do not create preview deployments during development.
- Do not update `main` until all targeted tests and syntax checks pass.
- Use one final `main` ref update and one Git-triggered Vercel production deployment.
- Do not add the nutritionist feature.
- Preserve the current Telegram topic IDs: products 263, holidays 44.

---

### Task 1: Strict Runtime Cache

**Files:**
- Create: `api/strict-runtime-cache.cjs`
- Create: `tests/strict-runtime-cache.test.cjs`

**Interfaces:**
- Produces: `createStrictRuntimeCache({ namespace, endpoint?, headers?, fetchImpl?, timeoutMs?, attempts?, retryDelayMs? })`

- [ ] Write regression tests for stale-then-fresh reads, repeated HTTP failure, confirmed 404, and Vercel-compatible key hashing.
- [ ] Verify the tests fail without the strict adapter.
- [ ] Implement the adapter with fresh-only reads, retries, explicit write errors, and the Vercel key transformation.
- [ ] Run `node --test tests/strict-runtime-cache.test.cjs` and verify PASS.

### Task 2: Products durable state and phantom seed

**Files:**
- Modify: `api/products-durable-state.cjs`
- Modify: `api/products-state.cjs`
- Create/extend product reliability tests.

**Interfaces:**
- `getProductsCache()` returns the strict cache for namespace `rudi-products-state-v2`.
- `ensureDurableHistory(cache)` migrates only a persisted legacy array.

- [ ] Add tests proving empty initialization becomes initialized without products.
- [ ] Add a test proving `legacy-seed` chicken mince is hidden but a real later add is visible.
- [ ] Add concurrent add, remove tombstone, clear, and real legacy migration tests.
- [ ] Replace soft cache access with strict cache access.
- [ ] Mark empty durable initialization so it cannot repeatedly fall back to legacy state.
- [ ] Stop calling the legacy seed-producing reader during durable initialization.
- [ ] Run all product reliability tests and verify PASS.

### Task 3: Last updater label

**Files:**
- Modify: `api/products-update-author.cjs`
- Modify: `api/products-state.cjs`
- Create: updater regression tests.

**Interfaces:**
- Produces: `runWithProductsUpdateAuthorName(name, task, options?)`.
- Visible line: `Обновлено: <имя> · HH:MM`.

- [ ] Add tests for replacing an existing update line, appending when absent, and not touching unrelated messages.
- [ ] Add tests for Telegram profile names and `Алиса` context.
- [ ] Implement the generic author context and product-list detection.
- [ ] Wrap Alice product runtime tasks with the `Алиса` author context.
- [ ] Run updater and product wrapper tests and verify PASS.

### Task 4: Holidays immediate rollover

**Files:**
- Create: `api/holiday-rollover.cjs`
- Modify: `api/topic-maintenance.cjs`
- Create: `tests/holiday-rollover.test.cjs`

**Interfaces:**
- Produces: `handleHolidayPublication(input, init, response, options?)`.

- [ ] Add tests for a single post, media group, failed publication, failed deletion, and first-run bootstrap.
- [ ] Implement strict replicated tracking of currently live Holiday message IDs.
- [ ] Run rollover only after Telegram successfully creates the new post.
- [ ] Preserve stale+new IDs when cleanup fails so a later publication retries them.
- [ ] Integrate rollover into the existing topic-maintenance fetch wrapper.
- [ ] Run holiday tests and verify PASS.

### Task 5: Audit and release

**Files:** all modified files and docs above.

- [ ] Run all targeted tests together.
- [ ] Run `node --check` on every changed `.cjs` file.
- [ ] Compare the unreferenced candidate commit with the current `main` and confirm only intended files changed.
- [ ] Confirm `main` did not advance; if it did, rebuild the candidate on the latest `main` before deployment.
- [ ] Update `main` exactly once to the verified candidate commit.
- [ ] Verify exactly one production deployment is created for that commit and reaches READY.
- [ ] Verify `/api/health` is 200.
- [ ] Read product state repeatedly from independent requests; verify it is stable and does not reintroduce a legacy chicken-mince seed.
- [ ] Verify the next products mutation keeps prior products and includes updater identity.
- [ ] Verify Holiday rollover on the next successful holiday publication via runtime logs/state without creating another deployment.
