# RUDI Publishing Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make recurring publishing resilient at section level with source-health gates, generalized deduplication, bounded retries, actionable alerting, a verified weekend digest, and removal of expired one-time routes.

**Architecture:** Build reliability primitives around the current generated runtime and native cinema/labor modules. Do not rewrite packed runtime wholesale. Native sections get explicit runners and journal transitions; generated-runtime sections are journaled from their returned result object and retain existing internal retry/source isolation. Generic fingerprinting and source-health helpers are reused by cinema, clients, events/weekend, and future recurring content.

**Tech Stack:** Node.js 24, CommonJS, Vercel Functions, Vercel Runtime Cache, Telegram Bot API through existing wrappers, `node:test`, Sharp through existing collage modules.

**Spec:** `docs/superpowers/specs/2026-08-29-rudi-control-plane-design.md`

## Global Constraints

- Complete after `2026-08-29-rudi-control-plane-core.md` so `rudi-settings`, journal, source-health, and control-plane cache interfaces exist.
- Do not deploy or merge while implementing.
- Preserve Facts/Lulu stable-ID logic; generic dedupe must not replace it.
- Never invent events or cinema items.
- Empty verified source results are different from source failure.
- Generated runtime must not be automatically replayed in full because one native section fails.
- All retries are bounded.
- Alerts contain no secrets and duplicate alerts are suppressed.
- Weather, transport, and conversational commands remain out of scope.

---

## File Map

- Create `api/content-fingerprint.cjs`: generic normalization/fingerprints and retention history.
- Modify `api/clients-advice.cjs`: expose advice identity/fingerprint and use generic dedupe state.
- Modify `api/cinema-premieres-collage.cjs`: record source health, generic fingerprints, journal state, message IDs.
- Modify `build.cjs`: instrument existing event-source result path to feed normalized source metadata without changing event-selection semantics.
- Create `api/alert-service.cjs`: Telegram operational alerts with dedupe.
- Create `api/section-runners.cjs`: native section runner registry for labor/cinema/weekend.
- Create `api/weekend-digest.cjs`: Friday/Saturday digest from verified event/cinema data.
- Create `api/daily-orchestrator.cjs`: journaled daily orchestration and generated-runtime result capture.
- Modify `api/daily-cron.js`: delegate to orchestrator.
- Modify `api/index.js`: export safe labor runner inputs needed by section runners, without duplicating router logic.
- Delete expired date-named API handlers after reference checks.
- Update/remove expired-route tests and add reliability tests.

---

### Task 1: Generic fingerprints and retention history

**Files:**
- Create: `api/content-fingerprint.cjs`
- Test: `tests/content-fingerprint.test.cjs`

**Interfaces:**
- Produces: `normalizeIdentityText(value) -> string`
- Produces: `normalizeIdentityUrl(value) -> string`
- Produces: `fingerprintContent(kind, item) -> sha256 string`
- Produces: `getRecentFingerprints(kind, options) -> Promise<Set<string>>`
- Produces: `rememberFingerprints(kind, fingerprints, days, options) -> Promise<void>`
- Produces: `filterUnseen(kind, items, days, options) -> Promise<{items, suppressed}>`

- [ ] **Step 1: Write failing normalization/fingerprint tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeIdentityText,
  normalizeIdentityUrl,
  fingerprintContent,
} = require('../api/content-fingerprint.cjs');

test('identity normalization ignores case, ё, spacing, harmless punctuation', () => {
  assert.equal(normalizeIdentityText('  Ёлка:  Live!  '), normalizeIdentityText('елка live'));
});

test('identity URL strips tracking params but keeps identity params', () => {
  assert.equal(
    normalizeIdentityUrl('https://example.com/a?id=12&utm_source=x&fbclid=y'),
    'https://example.com/a?id=12'
  );
});

test('event source id dominates fallback title identity', () => {
  const a = fingerprintContent('events', { source: 'yandex', id: '42', title: 'A' });
  const b = fingerprintContent('events', { source: 'yandex', id: '42', title: 'Renamed' });
  assert.equal(a, b);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/content-fingerprint.test.cjs`

- [ ] **Step 3: Implement domain-specific canonical identity**

Use `crypto.createHash('sha256')`. Canonical payload rules:

```js
switch (kind) {
  case 'recipes': return { id, title: norm(title), ingredients: normalizedIngredients };
  case 'clients': return { id, title: norm(title), body: norm(body), action: norm(action) };
  case 'events': return sourceId ? { source, sourceId } : { date, title: norm(title), venue: norm(venue), time: norm(time) };
  case 'cinema': return { title: norm(title), source: norm(source), releaseDate: releaseDate || null };
  case 'weekend': return { members: [...memberFingerprints].sort() };
  default: throw new Error(`Unsupported fingerprint kind: ${kind}`);
}
```

- [ ] **Step 4: Implement retention in control-plane cache**

Store `dedupe:<kind>:history` as rows `{ fingerprint, publishedAt }`. On read/write prune entries older than `days * 86400000`. Do not TTL the whole key because history retention must be deterministic and testable.

- [ ] **Step 5: Test pruning and commit**

Run: `node --test tests/content-fingerprint.test.cjs`

```bash
git add api/content-fingerprint.cjs tests/content-fingerprint.test.cjs
git commit -m "feat: add generic content deduplication"
```

---

### Task 2: Client advice dedupe integration

**Files:**
- Modify: `api/clients-advice.cjs`
- Test: `tests/clients-advice-dedupe.test.cjs`

**Interfaces:**
- Consumes: `fingerprintContent('clients', item)`, `filterUnseen`.
- Produces: `selectUnseenAdviceForDate(config, value, options)` while preserving `selectAdviceForDate` for compatibility.

- [ ] **Step 1: Write failing repeat-avoidance test**

```js
test('client advice chooses next unseen item when deterministic item is in history', async () => {
  const items = [
    { id: 'a', title: 'A', body: 'A body', action: 'A action' },
    { id: 'b', title: 'B', body: 'B body', action: 'B action' },
  ];
  const selected = await selectUnseenAdviceForDate(items, fixedDate, {
    seenFingerprints: new Set([fingerprintContent('clients', items[0])]),
  });
  assert.equal(selected.id, 'b');
});
```

- [ ] **Step 2: Add optional `id` support without breaking old config**

`isValidAdvice` continues accepting existing objects; if `id` is absent, derive stable identity from content. New config rows may carry explicit IDs later without deployment.

- [ ] **Step 3: Implement unseen selection**

Start at the existing deterministic date index, scan the catalog circularly, return first unseen. If all are seen, return deterministic item and expose `{ exhausted: true }` metadata to caller rather than failing publication.

- [ ] **Step 4: Run existing advice tests plus new test**

Run: `node --test tests/clients-advice*.test.cjs`

- [ ] **Step 5: Commit**

```bash
git add api/clients-advice.cjs tests/clients-advice-dedupe.test.cjs
git commit -m "feat: avoid recent client advice repeats"
```

---

### Task 3: Cinema source health, journal state, and dedupe

**Files:**
- Modify: `api/cinema-premieres-collage.cjs`
- Test: `tests/cinema-premieres-reliability.test.cjs`

**Interfaces:**
- Consumes: `recordSourceHealth`, publication journal, `fingerprintContent`, settings dedupe days.
- Produces: existing `publishWeeklyCinemaPremieres(options)` with richer return metadata and injected state dependencies.

- [ ] **Step 1: Write failing source-status tests**

Test these cases with injected source loaders and memory cache:

```js
// A: Kinopolis returns [] and Mirage returns [] => complete=true, source statuses empty, no alert-worthy failure.
// B: Kinopolis rejects, Mirage returns 2 => complete=false, one failed source, publish usable rows.
// C: both reject => throw, both source statuses failed, journal cinema=failed.
// D: duplicate title/fingerprint is suppressed and counted.
```

- [ ] **Step 2: Refactor source loads behind injectable functions**

Use:

```js
const loadKinopolis = options.loadKinopolis || legacy.loadKinopolisPremieres;
const loadMirage = options.loadMirage || legacy.loadMiragePremieres;
```

This keeps production semantics unchanged and makes tests deterministic.

- [ ] **Step 3: Record source health before publication**

For each settled result call `recordSourceHealth` with source IDs `cinema:kinopolis` and `cinema:mirage`, requested date, item count, and sanitized error.

- [ ] **Step 4: Apply generic cinema dedupe after merging sources**

Compute fingerprints before `.slice(maxItems)`, suppress recent fingerprints according to `settings.dedupe.cinemaDays`, and remember fingerprints only after Telegram send succeeds.

- [ ] **Step 5: Journal cinema publication**

At start call `markPublicationPending`. On success call `markPublicationPublished` with message IDs and fingerprints. On legitimate no-premieres result record `published` with `metadata.empty=true` because the section did publish a verified empty-state message. On thrown failure call `markPublicationFailed` before rethrow.

- [ ] **Step 6: Run tests and commit**

Run: `node --test tests/cinema-premieres*.test.cjs tests/cinema-premieres-reliability.test.cjs`

```bash
git add api/cinema-premieres-collage.cjs tests/cinema-premieres-reliability.test.cjs
git commit -m "feat: harden cinema publication state"
```

---

### Task 4: Event source health instrumentation without rewriting event generation

**Files:**
- Modify: `build.cjs`
- Create: `api/event-source-state.cjs`
- Test: `tests/event-source-state.test.cjs`
- Test: extend existing runtime patch tests if present.

**Interfaces:**
- Produces: `recordEventSourceSnapshot(snapshot, options)`.
- Generated runtime continues returning the same preview/publication fields; it additionally logs a compact machine-readable source snapshot via a callback hook installed by `api/index.js`.

- [ ] **Step 1: Add failing snapshot normalization tests**

```js
test('event snapshots distinguish empty from failed', () => {
  assert.deepEqual(normalizeEventSourceSnapshot('stage', { status: 'fulfilled', value: [] }), {
    sourceId: 'events:stage', status: 'empty', itemCount: 0, error: null,
  });
});
```

- [ ] **Step 2: Add a safe global hook instead of importing control modules into packed runtime**

In generated patch helper, after `Promise.allSettled`, call only when defined:

```js
if (typeof globalThis.__RUDI_EVENT_SOURCE_SNAPSHOT__ === 'function') {
  await globalThis.__RUDI_EVENT_SOURCE_SNAPSHOT__({ dateKey, yandexResult, stageResult });
}
```

Do not serialize Response objects; pass only status, item count, and error message.

- [ ] **Step 3: Install hook in `api/index.js`**

The hook converts the snapshot to calls to `recordSourceHealth` for `events:yandex` and `events:stage`. Catch hook errors and log `RUDI_EVENT_SOURCE_STATE_ERROR`; source-state persistence must not break event publication.

- [ ] **Step 4: Run build-patch tests and commit**

Run: `node --test tests/event-source-state.test.cjs tests/*event*.test.cjs && npm run build`

```bash
git add build.cjs api/event-source-state.cjs api/index.js tests/event-source-state.test.cjs
git commit -m "feat: record event source health"
```

---

### Task 5: Operational alert service with suppression

**Files:**
- Create: `api/alert-service.cjs`
- Test: `tests/alert-service.test.cjs`

**Interfaces:**
- Consumes: settings `alerts`, control-plane cache, existing bot token and forum chat ID resolvers.
- Produces: `emitOperationalAlert(alert, options) -> Promise<{sent, suppressed, fingerprint}>`
- Produces: `acknowledgeAlert(fingerprint, options)`
- Produces: `getAlertState(options)`

- [ ] **Step 1: Write failing dedupe test**

```js
test('same actionable alert is sent once inside dedupe window', async () => {
  const sent = [];
  const options = { cache: memoryCache(), dedupeMinutes: 180, send: async (text) => sent.push(text), now: t0 };
  assert.equal((await emitOperationalAlert({ code: 'cinema-failed', section: 'cinema', message: 'sources failed' }, options)).sent, true);
  assert.equal((await emitOperationalAlert({ code: 'cinema-failed', section: 'cinema', message: 'sources failed' }, { ...options, now: t1 })).suppressed, true);
  assert.equal(sent.length, 1);
});
```

- [ ] **Step 2: Implement stable alert fingerprint**

Hash only `{ code, section, normalized message }`; do not include timestamps or volatile stack traces.

- [ ] **Step 3: Implement default Telegram delivery**

Resolve token and chat ID through existing helpers and call `sendMessage` with plain text/HTML-safe content. Never include request headers, environment dumps, bot token, stack trace, or source body.

- [ ] **Step 4: Persist latest alert state and acknowledgements**

Keys: `alert:<fingerprint>` and `alerts:latest`. An acknowledgement sets `acknowledgedAt` but does not delete history.

- [ ] **Step 5: Run and commit**

Run: `node --test tests/alert-service.test.cjs`

```bash
git add api/alert-service.cjs tests/alert-service.test.cjs
git commit -m "feat: add deduplicated RUDI alerts"
```

---

### Task 6: Weekend digest from verified existing content

**Files:**
- Create: `api/weekend-digest.cjs`
- Test: `tests/weekend-digest.test.cjs`

**Interfaces:**
- Produces: `buildWeekendItems(input, options) -> { items, fingerprints }`
- Produces: `publishWeekendDigest(options) -> publication result`
- Uses only existing event/cinema loaders or their normalized result objects.

- [ ] **Step 1: Write minimum-content and duplicate tests**

```js
test('weekend digest skips instead of inventing filler below three verified items', async () => {
  const result = buildWeekendItems({ events: [event1], cinema: [film1] }, { seenFingerprints: new Set() });
  assert.equal(result.items.length, 2);
});

test('same event from two sources appears once', () => {
  const result = buildWeekendItems({ events: [eventA, duplicateEventA, eventB], cinema: [filmA] }, { seenFingerprints: new Set() });
  assert.equal(new Set(result.fingerprints).size, result.fingerprints.length);
});
```

- [ ] **Step 2: Implement mix selection**

Select up to 7 verified items. Prefer category diversity: concert, stand-up/stage, cinema, then other verified event. Do not require every category. If fewer than 3 unseen items remain, return `{ skipped: 'insufficient-verified-items' }` and journal `skipped`.

- [ ] **Step 3: Restrict publication to configured Moscow weekdays**

Use Monday-zero weekday `[4,5]` from settings, corresponding to Friday/Saturday. This is runtime configuration, so changing the array later does not require code changes.

- [ ] **Step 4: Publish one compact Telegram message**

Use the configured forum chat and either a configurable weekend topic ID if added to settings later, or the existing events topic as the initial destination. Make the destination explicit in settings before implementation if the spec's default would be ambiguous; do not create a forum topic automatically.

- [ ] **Step 5: Journal and remember fingerprints only on success**

Use section `weekend`, source IDs of contributing sources, and dedupe retention `settings.dedupe.weekendDays`.

- [ ] **Step 6: Run and commit**

Run: `node --test tests/weekend-digest.test.cjs`

```bash
git add api/weekend-digest.cjs tests/weekend-digest.test.cjs
git commit -m "feat: add verified weekend digest"
```

---

### Task 7: Native section runner registry and bounded retry

**Files:**
- Create: `api/section-runners.cjs`
- Test: `tests/section-runners.test.cjs`

**Interfaces:**
- Produces: `getNativeSectionRunner(section, options)`
- Produces: `runNativeSection(section, options) -> Promise<result>`
- Initial native sections: `labor`, `cinema`, `weekend`.

- [ ] **Step 1: Write runner registry test**

```js
test('only native sections have direct runners', () => {
  assert.equal(typeof getNativeSectionRunner('cinema', deps), 'function');
  assert.equal(typeof getNativeSectionRunner('labor', deps), 'function');
  assert.equal(typeof getNativeSectionRunner('weekend', deps), 'function');
  assert.equal(getNativeSectionRunner('facts', deps), null);
});
```

- [ ] **Step 2: Implement published-state guard**

Before running, read journal. If status is `published`, return `{ skipped: 'already-published' }`. Explicit admin retry is allowed only when record status is `failed`.

- [ ] **Step 3: Implement bounded automatic retry**

Default max attempts: 2 total attempts for native section work. Retry only thrown operational errors; do not retry `disabled`, `not-day`, `empty verified`, or `already-published` outcomes.

- [ ] **Step 4: Emit alert only after final failure**

Call `emitOperationalAlert` after retries are exhausted and after journal is marked failed.

- [ ] **Step 5: Run and commit**

Run: `node --test tests/section-runners.test.cjs`

```bash
git add api/section-runners.cjs tests/section-runners.test.cjs
git commit -m "feat: add section-level runners"
```

---

### Task 8: Daily orchestrator and generated-runtime journal capture

**Files:**
- Create: `api/daily-orchestrator.cjs`
- Modify: `api/daily-cron.js`
- Modify: `api/index.js`
- Test: `tests/daily-orchestrator.test.cjs`

**Interfaces:**
- Produces: `runDailyOrchestrator(req, res, options)`.
- Consumes: native runners, generated `runRuntime`, journal, settings, alert service.

- [ ] **Step 1: Write failure-isolation test**

```js
test('cinema failure does not prevent generated daily runtime', async () => {
  const calls = [];
  const result = await runDailyOrchestrator(req, res, {
    settingsLoader: fakeSettings,
    runNativeSection: async (section) => { calls.push(section); if (section === 'cinema') throw new Error('boom'); return { ok: true }; },
    runRuntime: async (_req, response) => response.status(200).json({ ok: true, date: '2026-08-30', results: { facts: { sent: true } } }),
    alert: async () => {},
    journal: fakeJournal,
  });
  assert.ok(calls.includes('cinema'));
  assert.equal(result.runtime.ok, true);
});
```

- [ ] **Step 2: Capture generated runtime response once**

Wrap `res.json` to copy the payload before delegating to the original response method. Never invoke generated runtime twice for one daily request.

- [ ] **Step 3: Normalize generated section results into journal records**

For each of `events`, `holidays`, `facts`, `morning`/`recipes`/`lulu`, and `clients`, map returned result fields to `published`, `skipped`, or `failed`. If runtime omits a section, do not invent success; record only sections present in the payload.

- [ ] **Step 4: Run native sections before generated runtime where response ownership requires it**

Order: topic cleanup, labor, cinema, weekend, generated runtime. Preserve existing behavior that native work happens before generated runtime owns/sends the HTTP response.

- [ ] **Step 5: Write daily summary after all possible work**

Include native statuses, generated statuses, failure count, and completion timestamp. If final required failures exist, emit one summary alert fingerprinted by date and failed section names.

- [ ] **Step 6: Replace `api/daily-cron.js` body with delegation**

Keep cron auth at the boundary. Example:

```js
async function handler(req, res) {
  if (!isCronRequestAuthorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized-cron' });
  return runDailyOrchestrator(req, res);
}
```

- [ ] **Step 7: Run and commit**

Run: `node --test tests/daily-orchestrator.test.cjs tests/*daily*.test.cjs`

```bash
git add api/daily-orchestrator.cjs api/daily-cron.js api/index.js tests/daily-orchestrator.test.cjs
git commit -m "feat: orchestrate RUDI publishing by section"
```

---

### Task 9: Remove expired one-time endpoints

**Files:**
- Delete candidates after reference checks:
  - `api/cinema-backfill-20260820.js`
  - `api/cinema-replace-20260820.js`
  - `api/recover-20260823.js`
  - `api/repair-daily-content-20260824.js`
  - `api/daily-content-repair-20260824.cjs` only if no reusable active import remains
- Modify: `vercel.json` to remove expired function config entries.
- Modify/delete tests that exclusively target removed routes.
- Test: `tests/expired-routes-removed.test.cjs`

**Interfaces:**
- No new runtime interface.

- [ ] **Step 1: Search every candidate before deletion**

Run:

```bash
grep -R "cinema-backfill-20260820\|cinema-replace-20260820\|recover-20260823\|repair-daily-content-20260824\|daily-content-repair-20260824" -n . --exclude-dir=node_modules --exclude-dir=.git
```

Classify every match as route config, test-only reference, or reusable active dependency. Do not delete a helper with active runtime consumers.

- [ ] **Step 2: Write route-absence test**

Test filesystem absence for expired route handler files and assert `vercel.json` contains no `api/recover-20260823.js` function config.

- [ ] **Step 3: Delete only confirmed expired handlers and tests**

If `daily-content-repair-20260824.cjs` is imported only by the expired JS route/tests, delete it; otherwise keep and rename only in a separate reviewed change, not as incidental cleanup.

- [ ] **Step 4: Run full relevant tests and build**

Run: `node --test tests/expired-routes-removed.test.cjs && npm test && npm run build`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove expired recovery endpoints"
```

---

### Task 10: Reliability-plan verification

- [ ] **Step 1: Run all new reliability tests**

```bash
node --test \
  tests/content-fingerprint.test.cjs \
  tests/clients-advice-dedupe.test.cjs \
  tests/cinema-premieres-reliability.test.cjs \
  tests/event-source-state.test.cjs \
  tests/alert-service.test.cjs \
  tests/weekend-digest.test.cjs \
  tests/section-runners.test.cjs \
  tests/daily-orchestrator.test.cjs \
  tests/expired-routes-removed.test.cjs
```

- [ ] **Step 2: Run complete test suite**

Run: `npm test`

Expected: 0 failures.

- [ ] **Step 3: Build runtime**

Run: `npm run build`

Expected: exit 0.

- [ ] **Step 4: Inspect generated runtime patch for accidental behavior drift**

Verify event message formatting, topic IDs, and existing Yandex/Stage selection remain unchanged except source-state hook instrumentation.

- [ ] **Step 5: Confirm no deployment was created**

Check Vercel deployment history without calling deploy. No commit from this plan should create a new deployment after `git.deploymentEnabled=false` is active in the branch content.
