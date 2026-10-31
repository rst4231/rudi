# Live Artemyev Implementation Plan

> Execute inline with superpowers:executing-plans; review the completed branch once.

**Goal:** OKX/Pionex live scanner, original virtual scanner archived, pending wallet/logo changes in one release.
**Architecture:** Separate encrypted account configuration, persistent order journal/claims, fixed exchange adapters, Frankfurt minute cron and shared parsed signal feed.
**Tech stack:** Existing CommonJS/vanilla JS, D1 state client, node:test.
**Spec:** docs/superpowers/specs/2026-10-21-live-artemyev-design.md

## Global Constraints
- No production deploy without user confirmation; trading stays disabled until user activation in the app.
- No real orders in development, no secrets in responses, no new product dependencies.
- No changes to virtual scanner calculations/history.

## Review Focus
- Lost order response or process crash must never duplicate entry/partial exit.
- Stop/disconnect/config races cannot remove protection or reactivate a paused account.
- Step rounding and exchange minima cannot exceed configured margin.
- Manual position changes cannot cause reversal or closure of unrelated exposure.
- Missing scheduler, source outage or malformed exchange response blocks entries.

### Task 1: Exchange adapters
Files api/crypto-live-exchanges.cjs, tests/crypto-live-exchanges.test.cjs.
Interface createExchange(provider,keys,options): inspect, instrument, price, order, findOrder, positions, leverage, fills.
- [x] Write/run failing signature, increment, order and error tests.
- [x] Implement fixed endpoint adapters and safe response normalization.
- [x] Run adapter tests.

### Task 2: Persistent execution engine
Files api/crypto-live.cjs, tests/crypto-live.test.cjs.
Interface report, connect, configure, pause, disconnect, run; use adapter API from Task 1.
- [x] Write/run failing tests for disabled state, risk limits, deduplication, lost replies, stops, manual exposure and state races.
- [x] Implement encrypted config, atomic claims/leases, bounded reconciliation and risk checks.
- [x] Run engine and adapter tests.

### Task 3: API and scheduler
Files api/finances.js, api/crypto-live-cron.js, vercel.json.
- [x] Write/run failing owner/cron auth and heartbeat tests.
- [x] Wire operations and Frankfurt one-minute cron, activation heartbeat gate.
- [x] Run route tests and syntax checks.

### Task 4: Live view and archive
Files public/crypto-live.js, public/crypto-live.css, public/index.html, build.cjs; existing signals/algo navigation.
- [x] Write/run failing UI behavior tests for exchange switching, secure fields, pause and archived scanner.
- [x] Implement real account settings/report/feed using current styles, archive original launch.
- [x] Verify interactions; browser if available, otherwise report the renderer limitation.

### Task 5: Release verification
Files rudi-version.json, VERSION, generated version/cache markers.
- [x] Build and run focused regression suite plus official test command; compare broad failures against original production source.
- [x] Review complete diff, record concrete limitations and fix material findings.
- [x] Commit locally and present changes once with Деплоим?; no deploy/push in advance.

User steering: use OKX instead of Bybit for live scanner. Also add Gate read-only wallet synchronization and its logo. Keep existing Bybit wallet support.

## Verification and release handoff (2026-10-21)
- Production still v4.286, read from /version.json. Local release v4.287; no deployment or real order placed.
- New wallet/live/scheduler tests: 42/42 pass. Final combined focused and regression suite: 123/123 pass. Related regression tests: 87/88 pass; the offline web-assets test also fails unchanged in the production snapshot.
- npm test: existing baseline calendar failures confirmed in /tmp/rudi-pionex-baseline: missing fake-indexeddb in calendar-time-save-latency; duplicate native inputs and undefined modal in v4.205-ios-date-time.
- One fresh reviewer found three Important defects. All fixed with failing-then-passing reproductions: definitive stop rejection retries, conservative short sizing plus actual margin accounting/overflow close, malformed fill/position validation.
- Browser QA attempted; Chromium absent and browser download failed. DOM interaction tests pass; full browser layout remains unverified.
- Cloudflare connector search/execute currently return Internal error. On release, preserve existing Worker bindings/secrets, publish updated rudi-crypto-market-worker.mjs and set its schedule to * * * * *; existing market refresh stays budgeted at 12 minutes. Confirm /health liveLastRun and application heartbeat after connection before enabling trading.
- Ruling: retain one current scanner and freeze old paper simulation in place, following later user steering over original separate-screen design.
- Ruling: use existing finance function and Cloudflare scheduler to avoid the Vercel function-count limit. No minute Vercel calls without connected accounts; no exchange requests for disabled accounts without managed exposure.
- Ruling: sell IOC cannot cap favorable execution price. Reserve quantity at the upper slippage price, account actual filled margin, and request immediate reduction on budget overflow. A close still depends on exchange availability and is not a guaranteed loss cap.
- Final release gate: ask Деплоим? once; do not deploy/push before explicit confirmation. Do not enable trading or place test orders.
