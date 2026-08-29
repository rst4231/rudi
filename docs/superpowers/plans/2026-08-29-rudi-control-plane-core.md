# RUDI Control Plane Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unified runtime settings, durable publication/source state, accurate health/preview endpoints, and disable automatic Git-triggered Vercel deployments without changing the existing content-generation behavior.

**Architecture:** Keep the packed/generated runtime intact. Add small CommonJS control-plane modules that read bundled JSON defaults, optionally read remote config, overlay Runtime Cache overrides, and expose journal/source-health data to health/preview. Existing `api/index.js` remains the main router but delegates health to the new control plane.

**Tech Stack:** Node.js 24, CommonJS, Vercel Functions, `@vercel/functions` Runtime Cache, Node `node:test`, existing generated runtime.

**Spec:** `docs/superpowers/specs/2026-08-29-rudi-control-plane-design.md`

## Global Constraints

- Do not deploy to Vercel while implementing or testing this package.
- Work on `fix/daily-content-reliability-clean`; it is deployment-disabled before this plan starts.
- Do not merge to `main` until the whole package passes tests and the user explicitly approves publication.
- Prefer Runtime Cache and validated JSON configuration over hard-coded operational settings.
- Keep bundled fallback configuration for production resilience.
- Preserve current Telegram topics and current daily publishing behavior unless the spec explicitly changes it.
- Do not add weather, transport, or conversational Telegram commands.
- Do not add a database, Redis, Edge Config, CMS, or frontend framework.
- Tests must use injected cache/fetch doubles and must not call Telegram or production Runtime Cache.

---

## File Map

- Create `config/rudi-settings.json`: bundled canonical defaults.
- Create `api/rudi-settings.cjs`: validation, remote loading, Runtime Cache overlay, override mutation/reset.
- Modify `api/stateful-cache.cjs`: add a dedicated `rudi-control-plane-v1` cache factory.
- Create `api/publication-journal.cjs`: durable per-date/per-section state and daily-run summary.
- Create `api/source-health.cjs`: durable source-health records with strict statuses.
- Create `api/control-plane-health.cjs`: build accurate `/api/health` payload from settings/state.
- Create `api/preview-date.cjs`: resolve `today`, `tomorrow`, and explicit Moscow dates.
- Modify `api/preview.js`: pass the resolved date to runtime dry-run and normalize response metadata.
- Modify `api/index.js`: route health to the new health builder rather than generated stale health metadata.
- Modify `vercel.json`: set `git.deploymentEnabled` to `false`; keep cron expression as deployment-owned configuration.
- Add focused tests under `tests/`.

---

### Task 1: Unified settings with Runtime Cache overlay

**Files:**
- Create: `config/rudi-settings.json`
- Create: `api/rudi-settings.cjs`
- Modify: `api/stateful-cache.cjs`
- Test: `tests/rudi-settings.test.cjs`

**Interfaces:**
- Produces: `validateRudiSettings(input) -> normalized settings object`
- Produces: `loadRudiSettings(options) -> Promise<{ settings, source, overrides }>`
- Produces: `setRudiSettingsOverride(patch, options) -> Promise<object>`
- Produces: `resetRudiSettingsOverride(path, options) -> Promise<object>`
- Produces: `getControlPlaneCache(options) -> cache`

- [ ] **Step 1: Write failing validation/overlay tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateRudiSettings,
  loadRudiSettings,
  setRudiSettingsOverride,
  resetRudiSettingsOverride,
} = require('../api/rudi-settings.cjs');

function memoryCache(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async set(key, value) { data.set(key, structuredClone(value)); return true; },
    async delete(key) { data.delete(key); return true; },
  };
}

test('settings overlay changes enabled state without mutating fallback', async () => {
  const fallback = validateRudiSettings(require('../config/rudi-settings.json'));
  const cache = memoryCache({ 'settings:overrides': { sections: { facts: { enabled: false } } } });
  const loaded = await loadRudiSettings({ localConfig: fallback, cache, fetchImpl: null });
  assert.equal(loaded.settings.sections.facts.enabled, false);
  assert.equal(fallback.sections.facts.enabled, true);
});

test('override mutation accepts only schema fields and reset removes one path', async () => {
  const cache = memoryCache();
  await setRudiSettingsOverride({ sections: { facts: { enabled: false } } }, { cache });
  const afterReset = await resetRudiSettingsOverride('sections.facts.enabled', { cache });
  assert.deepEqual(afterReset, { sections: { facts: {} } });
});
```

- [ ] **Step 2: Run the targeted test and confirm failure**

Run: `node --test tests/rudi-settings.test.cjs`

Expected: FAIL because `api/rudi-settings.cjs` and `config/rudi-settings.json` do not exist.

- [ ] **Step 3: Add the bundled settings file**

Use this exact initial shape, preserving the current topic IDs and excluding weather/transport/commands:

```json
{
  "version": 1,
  "timezone": "Europe/Moscow",
  "sections": {
    "events": { "enabled": true, "topicId": 19 },
    "holidays": { "enabled": true, "topicId": 44 },
    "facts": { "enabled": true, "topicId": 72 },
    "lulu": { "enabled": true, "topicId": 85 },
    "recipes": { "enabled": true, "topicId": 88 },
    "clients": { "enabled": true, "topicId": 126 },
    "cinema": { "enabled": true },
    "labor": { "enabled": true },
    "weekend": { "enabled": true }
  },
  "publishing": {
    "dailyCronDescription": "Daily 00:30 Moscow",
    "weekendDays": [4, 5],
    "allowAutomaticRetry": true
  },
  "dedupe": {
    "eventsDays": 30,
    "cinemaDays": 60,
    "recipesDays": 45,
    "clientsDays": 45,
    "weekendDays": 30
  },
  "alerts": {
    "enabled": true,
    "dedupeMinutes": 180
  }
}
```

- [ ] **Step 4: Implement `getControlPlaneCache`**

In `api/stateful-cache.cjs` add:

```js
function getControlPlaneCache(options = {}) {
  return createStrictRuntimeCache({
    namespace: 'rudi-control-plane-v1',
    confirmWrites: false,
    ...options,
  });
}
```

Export it without changing existing cache factories.

- [ ] **Step 5: Implement validated loading and overlays**

`api/rudi-settings.cjs` must:

```js
const localDefault = require('../config/rudi-settings.json');
const { getControlPlaneCache } = require('./stateful-cache.cjs');
const DEFAULT_CONFIG_URL = 'https://raw.githubusercontent.com/rst4231/rudi/main/config/rudi-settings.json';
const OVERRIDES_KEY = 'settings:overrides';

async function loadRudiSettings(options = {}) {
  const localConfig = validateRudiSettings(options.localConfig || localDefault);
  const remote = await loadRemoteSettings(options, localConfig);
  const cache = options.cache || getControlPlaneCache();
  const overrides = sanitizeOverrideTree(await cache.get(OVERRIDES_KEY));
  return {
    settings: validateRudiSettings(deepMerge(remote.value, overrides)),
    source: remote.source,
    overrides,
  };
}
```

Validation must reject unknown top-level keys, invalid section names, non-boolean `enabled`, non-positive topic IDs, invalid dedupe day counts, and non-positive alert dedupe minutes. Remote fetch failure falls back to bundled config and returns `source: 'bundled'`.

- [ ] **Step 6: Implement override mutation/reset**

Use one cache key only (`settings:overrides`) so mutations are atomic at the application level. `setRudiSettingsOverride` merges a validated patch into current overrides. `resetRudiSettingsOverride('sections.facts.enabled')` deletes exactly that leaf and prunes empty parent objects.

- [ ] **Step 7: Run tests**

Run: `node --test tests/rudi-settings.test.cjs`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add config/rudi-settings.json api/rudi-settings.cjs api/stateful-cache.cjs tests/rudi-settings.test.cjs
git commit -m "feat: add unified RUDI runtime settings"
```

---

### Task 2: Publication journal and daily run summaries

**Files:**
- Create: `api/publication-journal.cjs`
- Test: `tests/publication-journal.test.cjs`

**Interfaces:**
- Consumes: `getControlPlaneCache()` from Task 1.
- Produces: `journalKey(date, section)`
- Produces: `getPublicationRecord(date, section, options)`
- Produces: `markPublicationPending(input, options)`
- Produces: `markPublicationPublished(input, options)`
- Produces: `markPublicationSkipped(input, options)`
- Produces: `markPublicationFailed(input, options)`
- Produces: `getLatestPublication(section, options)`
- Produces: `writeDailyRunSummary(date, summary, options)` and `getLatestDailyRun(options)`

- [ ] **Step 1: Write failing state-transition tests**

```js
test('published section is idempotent for the same date', async () => {
  const cache = memoryCache();
  await markPublicationPending({ date: '2026-08-30', section: 'facts' }, { cache, now: fixedNow });
  await markPublicationPublished({ date: '2026-08-30', section: 'facts', messageIds: [101] }, { cache, now: fixedNow });
  const row = await getPublicationRecord('2026-08-30', 'facts', { cache });
  assert.equal(row.status, 'published');
  assert.equal(row.attempts, 1);
  assert.deepEqual(row.messageIds, [101]);
});

test('failure increments attempts but preserves first startedAt', async () => {
  const cache = memoryCache();
  await markPublicationPending({ date: '2026-08-30', section: 'cinema' }, { cache, now: fixedNow });
  await markPublicationFailed({ date: '2026-08-30', section: 'cinema', error: 'source failed' }, { cache, now: later });
  await markPublicationPending({ date: '2026-08-30', section: 'cinema' }, { cache, now: later });
  const row = await getPublicationRecord('2026-08-30', 'cinema', { cache });
  assert.equal(row.attempts, 2);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/publication-journal.test.cjs`

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement record shape and state guards**

Use key `journal:<date>:<section>` and latest pointer `journal:latest:<section>`. Validate section against the settings section names. Store:

```js
{
  date,
  section,
  status: 'pending' | 'published' | 'skipped' | 'failed',
  attempts,
  startedAt,
  finishedAt,
  messageIds: [],
  sourceIds: [],
  fingerprints: [],
  error: null,
  metadata: {}
}
```

A `published` record must never be changed back to `pending` by automatic code. Only `failed` and missing records can be retried automatically.

- [ ] **Step 4: Implement daily summary pointers**

Store `daily-run:<date>` and `daily-run:latest`, including section statuses and total failures. Never store secrets/request headers.

- [ ] **Step 5: Run test and commit**

Run: `node --test tests/publication-journal.test.cjs`

```bash
git add api/publication-journal.cjs tests/publication-journal.test.cjs
git commit -m "feat: add durable publication journal"
```

---

### Task 3: Source-health state

**Files:**
- Create: `api/source-health.cjs`
- Test: `tests/source-health.test.cjs`

**Interfaces:**
- Consumes: `getControlPlaneCache()`.
- Produces: `recordSourceHealth(input, options)`
- Produces: `getSourceHealth(sourceId, options)`
- Produces: `listSourceHealth(sourceIds, options)`
- Produces: `classifySourceResult({ ok, itemCount, stale, error })`

- [ ] **Step 1: Write failing classification tests**

```js
test('empty is not failed', () => {
  assert.equal(classifySourceResult({ ok: true, itemCount: 0 }), 'empty');
  assert.equal(classifySourceResult({ ok: false, error: 'timeout' }), 'failed');
  assert.equal(classifySourceResult({ ok: true, itemCount: 3, stale: true }), 'stale');
  assert.equal(classifySourceResult({ ok: true, itemCount: 3 }), 'healthy');
});
```

- [ ] **Step 2: Implement exact status vocabulary**

Only allow `healthy`, `empty`, `stale`, `failed`. Persist `source:<id>:latest`:

```js
{
  sourceId,
  checkedAt,
  requestedDate: null,
  status,
  itemCount: 0,
  error: null,
  fallbackSource: null,
  metadata: {}
}
```

- [ ] **Step 3: Ensure error sanitization**

Strip bearer tokens, `bot<token>` Telegram URL fragments, and strings matching environment-secret values passed through `options.secrets` before persistence.

- [ ] **Step 4: Run and commit**

Run: `node --test tests/source-health.test.cjs`

```bash
git add api/source-health.cjs tests/source-health.test.cjs
git commit -m "feat: track source health"
```

---

### Task 4: Accurate health endpoint

**Files:**
- Create: `api/control-plane-health.cjs`
- Modify: `api/index.js`
- Test: `tests/control-plane-health.test.cjs`

**Interfaces:**
- Consumes: `loadRudiSettings`, journal latest records, source-health records.
- Produces: `buildHealthPayload(options) -> Promise<object>`

- [ ] **Step 1: Write failing health regression test**

```js
test('health reports active settings and never exposes removed venue rubric', async () => {
  const payload = await buildHealthPayload({
    now: new Date('2026-08-29T17:30:00Z'),
    settingsLoader: async () => ({ settings: fallbackSettings, source: 'bundled', overrides: {} }),
    getLatestDailyRun: async () => ({ date: '2026-08-29', failures: 0 }),
    getLatestPublication: async (section) => ({ section, status: 'published' }),
    listSourceHealth: async () => [],
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.service, 'spb-daily-guide-bot');
  assert.equal(payload.date, '2026-08-29');
  assert.ok(!JSON.stringify(payload).includes('Sevkabel'));
  assert.ok(!JSON.stringify(payload).includes('Brusnitsyn'));
});
```

- [ ] **Step 2: Implement health payload**

Return:

```js
{
  ok: true,
  service: 'spb-daily-guide-bot',
  date,
  generatedAt,
  timezone: settings.timezone,
  settingsVersion: settings.version,
  settingsSource: source,
  cron: { schedule: '30 21 * * *', description: settings.publishing.dailyCronDescription },
  sections,
  lastDailyRun,
  latestPublications,
  sourceHealth,
  overrides,
}
```

Do not derive event order from old generated runtime metadata.

- [ ] **Step 3: Route `/api/health` through the new builder**

In `api/index.js`, replace the `runHealthWithoutCouple` route for `route === 'health'` with a direct `buildHealthPayload()` response. Keep `runHealthWithoutCouple` exported temporarily if tests or older modules still import it; remove only after repository search proves no active consumer.

- [ ] **Step 4: Run targeted tests plus existing health tests**

Run: `node --test tests/control-plane-health.test.cjs tests/*health*.test.cjs`

Expected: PASS and no stale venue labels.

- [ ] **Step 5: Commit**

```bash
git add api/control-plane-health.cjs api/index.js tests/control-plane-health.test.cjs
git commit -m "fix: make RUDI health reflect live control state"
```

---

### Task 5: Date-correct preview endpoint

**Files:**
- Create: `api/preview-date.cjs`
- Modify: `api/preview.js`
- Test: `tests/preview-date.test.cjs`
- Test: `tests/preview-control-plane.test.cjs`

**Interfaces:**
- Produces: `resolvePreviewDate(input, now) -> YYYY-MM-DD`
- Produces: updated `runPreview(req, res, options)` that injects resolved date and metadata without sending Telegram messages.

- [ ] **Step 1: Write date resolution tests**

```js
test('today/tomorrow use Europe/Moscow calendar', () => {
  const now = new Date('2026-08-29T21:30:00Z'); // 00:30 Moscow on Aug 30
  assert.equal(resolvePreviewDate('today', now), '2026-08-30');
  assert.equal(resolvePreviewDate('tomorrow', now), '2026-08-31');
  assert.equal(resolvePreviewDate('2026-09-02', now), '2026-09-02');
  assert.throws(() => resolvePreviewDate('next-week', now), /preview date/i);
});
```

- [ ] **Step 2: Write preview request injection test**

Use a fake handler that asserts:

```js
assert.equal(req.query.route, 'preview');
assert.equal(req.query.date, '2026-08-30');
```

and returns `{ ok: true, date: '2026-08-30', results: {} }` through `res.json`.

- [ ] **Step 3: Implement date helper and update `preview.js`**

`runPreview` must resolve `req.query.date || 'today'`, set `route: 'preview'` and `date: resolvedDate`, pass `now` into client advice selection, and wrap JSON output to add:

```js
{
  ...payload,
  requestedDate: resolvedDate,
  generatedAt: new Date(now).toISOString()
}
```

If the underlying runtime returns a different `date`, include warning `{ code: 'runtime-date-mismatch', expected, actual }` rather than silently claiming the wrong day.

- [ ] **Step 4: Confirm preview is side-effect-free in tests**

Injected fetch must throw if a Telegram API URL is called. The test must still pass.

- [ ] **Step 5: Run and commit**

Run: `node --test tests/preview-date.test.cjs tests/preview-control-plane.test.cjs tests/clients-advice-integration.test.cjs`

```bash
git add api/preview-date.cjs api/preview.js tests/preview-date.test.cjs tests/preview-control-plane.test.cjs
git commit -m "fix: make RUDI preview date explicit"
```

---

### Task 6: Disable automatic Git deployments

**Files:**
- Modify: `vercel.json`
- Test: `tests/vercel-deployment-policy.test.cjs`

**Interfaces:**
- Produces: repository policy only; no runtime API.

- [ ] **Step 1: Write failing config test**

```js
test('automatic Git deployments are globally disabled', () => {
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.equal(config.git.deploymentEnabled, false);
  assert.equal(config.crons[0].schedule, '30 21 * * *');
});
```

- [ ] **Step 2: Run and confirm current branch-specific object fails**

Run: `node --test tests/vercel-deployment-policy.test.cjs`

Expected: FAIL because `deploymentEnabled` is currently an object.

- [ ] **Step 3: Modify only the Git policy**

Set:

```json
"git": { "deploymentEnabled": false }
```

Do not change the cron expression; actual cron changes remain deployment-owned by Vercel.

- [ ] **Step 4: Run config test and existing full JSON validation**

Run: `node --test tests/vercel-deployment-policy.test.cjs && node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"`

- [ ] **Step 5: Commit**

```bash
git add vercel.json tests/vercel-deployment-policy.test.cjs
git commit -m "chore: disable automatic Vercel Git deployments"
```

---

### Task 7: Core-plan verification

**Files:**
- No production file changes unless verification exposes a defect.

- [ ] **Step 1: Run all core targeted tests**

```bash
node --test \
  tests/rudi-settings.test.cjs \
  tests/publication-journal.test.cjs \
  tests/source-health.test.cjs \
  tests/control-plane-health.test.cjs \
  tests/preview-date.test.cjs \
  tests/preview-control-plane.test.cjs \
  tests/vercel-deployment-policy.test.cjs
```

Expected: all PASS.

- [ ] **Step 2: Run complete suite**

Run: `npm test`

Expected: 0 failures.

- [ ] **Step 3: Build generated runtime**

Run: `npm run build`

Expected: exit 0; generated runtime builds successfully.

- [ ] **Step 4: Confirm branch does not trigger a Vercel deployment**

Inspect Vercel only after commits; do not call deploy. There must be no new production deployment created by these plan commits.

- [ ] **Step 5: Commit verification-only fixes if needed**

If no code fixes are needed, do not create an empty commit.
