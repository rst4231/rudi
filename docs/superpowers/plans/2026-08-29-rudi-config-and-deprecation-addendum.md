# RUDI Operational Config and Deprecation Addendum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two gaps found during plan self-review: make source/copy controls genuinely no-deploy operational settings and eliminate the repeated Node `DEP0169 url.parse()` warning from RUDI-owned execution.

**Architecture:** Extend the unified settings from the core plan rather than creating another config system. Existing specialized JSON catalogs remain the content stores, while `rudi-settings.json` becomes the control plane that chooses their URLs and reusable copy/footer behavior. For `url.parse`, first prove the warning origin against the locally built generated runtime with trace-deprecation; then remove the RUDI-owned legacy call at build/source level. The final regression test rejects any RUDI-owned `url.parse` usage.

**Tech Stack:** Node.js 24, CommonJS, existing config loaders/build patches, `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-29-rudi-control-plane-design.md`

## Global Constraints

- Execute after Task 1 of the core plan creates `rudi-settings.cjs`.
- Specialized catalogs (`daily-content.json`, `events.json`, `clients-advice.json`) remain external content data and are not duplicated into one giant file.
- Changing which catalog URL is active must not require deployment.
- Text overrides from the admin plan remain the mechanism for replacing a particular dated post; `copy.footers` is reusable default copy.
- Actual Vercel cron expression still requires deployment; the settings file only controls descriptive/behavioral schedule options.
- Do not suppress deprecation warnings globally. Fix the source.

---

### Task 1: Extend unified settings with source URLs and reusable copy

**Files:**
- Modify: `config/rudi-settings.json`
- Modify: `api/rudi-settings.cjs`
- Test: extend `tests/rudi-settings.test.cjs`

**Interfaces:**
- Existing `loadRudiSettings()` now returns validated `sources` and `copy` blocks.

- [ ] **Step 1: Add failing URL/copy validation tests**

```js
test('operational settings validate external catalog URLs', () => {
  const settings = validateRudiSettings({
    ...base,
    sources: {
      dailyContentConfigUrl: 'https://example.test/daily.json',
      dailyContentSequenceUrl: 'https://example.test/sequence.json',
      eventsConfigUrl: 'https://example.test/events.json',
      clientsAdviceConfigUrl: 'https://example.test/clients.json'
    },
    copy: { footers: { facts: 'Мой футер' } }
  });
  assert.equal(settings.sources.eventsConfigUrl, 'https://example.test/events.json');
  assert.equal(settings.copy.footers.facts, 'Мой футер');
});

test('non-http source URLs are rejected', () => {
  assert.throws(() => validateRudiSettings({ ...base, sources: { ...base.sources, eventsConfigUrl: 'file:///tmp/x' } }), /eventsConfigUrl/);
});
```

- [ ] **Step 2: Add exact default source block**

```json
"sources": {
  "dailyContentConfigUrl": "https://raw.githubusercontent.com/rst4231/rudi/main/config/daily-content.json",
  "dailyContentSequenceUrl": "https://raw.githubusercontent.com/rst4231/rudi/main/config/daily-content-sequence.json",
  "eventsConfigUrl": "https://raw.githubusercontent.com/rst4231/rudi/main/config/events.json",
  "clientsAdviceConfigUrl": "https://raw.githubusercontent.com/rst4231/rudi/main/config/clients-advice.json"
},
"copy": {
  "footers": {
    "events": "",
    "holidays": "",
    "facts": "",
    "lulu": "",
    "recipes": "",
    "clients": "",
    "cinema": "",
    "labor": "",
    "weekend": ""
  }
}
```

- [ ] **Step 3: Validate source URLs and footer limits**

Source URL must be HTTP/HTTPS. Footer keys must be known sections; each footer max 800 characters. Empty string means no footer.

- [ ] **Step 4: Run tests and commit**

Run: `node --test tests/rudi-settings.test.cjs`

```bash
git add config/rudi-settings.json api/rudi-settings.cjs tests/rudi-settings.test.cjs
git commit -m "feat: move RUDI source controls into settings"
```

---

### Task 2: Make existing external catalog loaders consume unified source settings

**Files:**
- Modify: `api/daily-content-config.cjs`
- Modify: `api/events-config.cjs`
- Modify: `api/clients-advice.cjs`
- Modify: `api/topic-maintenance.cjs`
- Test: `tests/operational-source-config.test.cjs`

**Interfaces:**
- Each loader still accepts an explicit `configUrl` option for tests/callers.
- When explicit URL is absent, caller-provided `settings.sources.*` wins over legacy hard-coded default.

- [ ] **Step 1: Write failing source-switch test**

```js
test('events loader uses URL supplied by unified settings without deployment', async () => {
  const requested = [];
  const config = await loadEventsConfig({
    settings: { sources: { eventsConfigUrl: 'https://config.test/events-v2.json' } },
    fetchImpl: async (url) => { requested.push(String(url)); return jsonResponse(validEventsConfig); },
    cacheMs: 0,
  });
  assert.equal(requested[0], 'https://config.test/events-v2.json');
  assert.ok(config.blockedVenueTokens.length);
});
```

- [ ] **Step 2: Apply explicit priority consistently**

For each loader:

```text
options.configUrl
→ options.settings.sources.<matchingUrl>
→ process.env legacy override
→ existing DEFAULT_CONFIG_URL
```

This keeps backward compatibility while making admin/runtime settings authoritative when supplied.

- [ ] **Step 3: Pass effective settings through topic-maintenance config calls**

`topic-maintenance.wrapFetch` loads settings once per publication context or accepts `options.settings`, then passes the relevant source URLs into client advice and daily content loaders. Do not fetch unified settings once per individual recipe/fact message.

- [ ] **Step 4: Run and commit**

Run: `node --test tests/operational-source-config.test.cjs tests/clients-advice*.test.cjs tests/daily-content*.test.cjs tests/*events*.test.cjs`

```bash
git add api/daily-content-config.cjs api/events-config.cjs api/clients-advice.cjs api/topic-maintenance.cjs tests/operational-source-config.test.cjs
git commit -m "feat: load content sources from RUDI settings"
```

---

### Task 3: Apply reusable section footers through Telegram publication middleware

**Files:**
- Modify: `api/section-controls.cjs` (created by admin plan)
- Test: extend `tests/section-controls.test.cjs`

**Interfaces:**
- `applySectionControlToTelegramRequest` also applies `settings.copy.footers[section]` after date-specific text override selection and before feedback markup.

- [ ] **Step 1: Write footer behavior tests**

```js
test('configured footer is appended once', async () => {
  const first = await rewriteWithFooter('facts', 'Факт\n\nИсточник →', 'Подпись');
  assert.equal(first, 'Факт\n\nИсточник →\n\nПодпись');
  const second = await rewriteWithFooter('facts', first, 'Подпись');
  assert.equal(second, first);
});
```

- [ ] **Step 2: Implement footer append**

Normalize footer whitespace, do not append if empty, and do not duplicate if normalized message already ends with normalized footer. Text override is the base message, so a dated override still receives the current configured footer unless its admin payload explicitly uses `includeFooter:false`.

- [ ] **Step 3: Run and commit**

Run: `node --test tests/section-controls.test.cjs`

```bash
git add api/section-controls.cjs tests/section-controls.test.cjs
git commit -m "feat: make RUDI footers configurable"
```

---

### Task 4: Trace and eliminate Node `DEP0169 url.parse()` warning

**Files:**
- Create: `tests/no-legacy-url-parse.test.cjs`
- Modify: `build.cjs` if generated runtime contains the call.
- Modify: the exact owned API module identified by trace if the call is outside generated runtime.
- `package.json` may be changed only if trace proves the warning originates inside the installed `@vercel/functions` package and not RUDI-owned code.

**Interfaces:**
- No new application API. Acceptance is zero RUDI-owned `DEP0169` warnings under Node 24 for the exercised handlers.

- [ ] **Step 1: Build first and scan owned code**

Run:

```bash
npm run build
grep -R "url\.parse(" -n api build.cjs runtime/generated-runtime.cjs --include='*.js' --include='*.cjs' || true
```

Record the exact match count in the implementation notes/commit body.

- [ ] **Step 2: Run a trace-deprecation reproduction**

Create `tests/no-legacy-url-parse.test.cjs` that spawns Node with `--trace-deprecation` against a small fixture script which requires the production handler and exercises a dry-run preview with injected/fake network dependencies. Assert stderr does not include `[DEP0169]`.

The child command is:

```js
spawnSync(process.execPath, ['--trace-deprecation', fixturePath], {
  cwd: path.join(__dirname, '..'),
  encoding: 'utf8',
  env: { ...process.env, NODE_ENV: 'test' },
});
```

- [ ] **Step 3: Fix according to trace ownership, without warning suppression**

Allowed evidence-driven fixes are strictly:

1. **Generated runtime match:** add a targeted `patchLegacyUrlParse(source)` in `build.cjs` that replaces the exact traced legacy parser with WHATWG `new URL(...)` semantics and add a unit test for the transformed snippet.
2. **RUDI API module match:** replace `require('node:url').parse(...)` / `url.parse(...)` with `new URL(value, baseWhenRequired)` in that module and preserve existing return fields explicitly.
3. **`@vercel/functions` package trace:** first pin/update `@vercel/functions` to the current stable 3.9.x release verified during implementation, rerun trace, and keep the package change only if it removes the warning without breaking Runtime Cache tests. As of plan creation, npm reports stable `@vercel/functions` 3.9.5; re-verify before editing dependency metadata.

Do not add `--no-deprecation`, `NODE_NO_WARNINGS`, `process.removeAllListeners('warning')`, or stderr filtering.

- [ ] **Step 4: Add static regression assertion**

After build, scan RUDI-owned `api`, `build.cjs`, and `runtime/generated-runtime.cjs` and fail if literal `url.parse(` remains. Package internals under `node_modules` are excluded from the static assertion because trace-deprecation covers runtime dependency behavior.

- [ ] **Step 5: Run targeted and full verification**

```bash
node --test tests/no-legacy-url-parse.test.cjs
npm test
npm run build
```

Expected: no `[DEP0169]` in the regression child process and all tests pass.

- [ ] **Step 6: Commit**

```bash
git add build.cjs api package.json tests/no-legacy-url-parse.test.cjs
git commit -m "fix: remove legacy URL parsing warning"
```

Stage only files actually changed; do not commit generated output if repository policy ignores it.

---

### Task 5: Addendum verification

- [ ] **Step 1: Change a source URL in a memory-cache settings override and prove loaders use it without code changes.**

Run: `node --test tests/operational-source-config.test.cjs tests/rudi-settings.test.cjs`

- [ ] **Step 2: Change a footer override and prove outgoing text changes without build/deploy.**

Run: `node --test tests/section-controls.test.cjs`

- [ ] **Step 3: Re-run deprecation test after a clean build.**

Run: `npm run build && node --test tests/no-legacy-url-parse.test.cjs`

- [ ] **Step 4: Run full suite.**

Run: `npm test`

Expected: 0 failures.
