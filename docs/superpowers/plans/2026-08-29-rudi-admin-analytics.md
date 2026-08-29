# RUDI Admin and Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated browser administration, no-deploy section/text controls, manual single-section publishing, feedback buttons and utility analytics on top of the control-plane/reliability primitives.

**Architecture:** Store mutable controls in the existing control-plane Runtime Cache. A Telegram publication middleware maps topic IDs to sections and applies date-specific skip/text overrides to generated-runtime sends without rewriting the generated runtime. The static admin page talks to a narrow authenticated `/api/admin` API. Feedback buttons are attached only to eligible recurring content and callbacks are acknowledged before durable analytics work.

**Tech Stack:** Node.js 24, CommonJS, Vercel Functions, Runtime Cache, Telegram Bot API, `node:crypto`, `AsyncLocalStorage`, plain HTML/CSS/JavaScript, `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-29-rudi-control-plane-design.md`

## Global Constraints

- Execute after both core and publishing-reliability plans.
- Do not deploy or merge while implementing.
- `RUDI_ADMIN_SECRET` is preferred; `CRON_SECRET` is the admin-auth fallback.
- Never embed secrets in HTML, JS, JSON responses, logs, journal metadata, or callback data.
- Text/config mutations must be schema-validated and limited to intended operational fields.
- Manual publishing must publish only the selected section and must never replay the complete daily runtime.
- A published journal record is not silently re-published; retry is limited to failed sections unless the admin explicitly uses the separate manual publish action and confirms it.
- Feedback callback acknowledgement happens before slow cache writes.
- Do not automatically disable a low-rated section.
- No weather, transport, or conversational commands.

---

## File Map

- Create `api/admin-auth.cjs`: constant-time bearer authentication.
- Create `api/section-controls.cjs`: date/section skip and text overrides plus request-scoped part counters.
- Modify `api/topic-maintenance.cjs`: apply generated-section controls before sending Telegram requests and attach feedback markup.
- Create `api/manual-section-publisher.cjs`: convert preview section to message parts and publish only that section.
- Create `api/feedback-analytics.cjs`: signed callback data, quick acknowledgement, aggregate counters.
- Modify `api/index.js`: route feedback callbacks before passive Telegram filtering.
- Create `api/admin-api.cjs` and `api/admin.js`: authenticated dashboard/actions.
- Create `public/admin.html`: static admin UI.
- Modify `public/index.html`: service landing link/state only, no secret.
- Modify `vercel.json`: static `/admin` rewrite and API function duration if needed; automatic Git deployments remain disabled.
- Add admin/feedback/control tests.

---

### Task 1: Constant-time admin authentication

**Files:**
- Create: `api/admin-auth.cjs`
- Test: `tests/admin-auth.test.cjs`

**Interfaces:**
- Produces: `resolveAdminSecret(env) -> string`
- Produces: `extractBearerToken(req) -> string`
- Produces: `isAdminAuthorized(req, env) -> boolean`
- Produces: `requireAdmin(req, res, env) -> boolean`

- [ ] **Step 1: Write failing auth tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { isAdminAuthorized, resolveAdminSecret } = require('../api/admin-auth.cjs');

test('RUDI_ADMIN_SECRET wins over CRON_SECRET', () => {
  assert.equal(resolveAdminSecret({ RUDI_ADMIN_SECRET: 'admin', CRON_SECRET: 'cron' }), 'admin');
});

test('CRON_SECRET is accepted only when admin secret is absent', () => {
  assert.equal(isAdminAuthorized({ headers: { authorization: 'Bearer cron' } }, { CRON_SECRET: 'cron' }), true);
  assert.equal(isAdminAuthorized({ headers: { authorization: 'Bearer cron' } }, { RUDI_ADMIN_SECRET: 'admin', CRON_SECRET: 'cron' }), false);
});
```

- [ ] **Step 2: Implement constant-time comparison**

Use `crypto.timingSafeEqual` on equal-length Buffers. Length mismatch returns false without comparing secret contents.

```js
function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}
```

- [ ] **Step 3: Implement HTTP helper**

`requireAdmin` returns `false` after `res.status(401).json({ ok:false, error:'unauthorized-admin' })`, otherwise `true`. If no admin/cron secret exists, return 503 `admin-secret-not-configured` rather than accidentally allowing access.

- [ ] **Step 4: Run and commit**

Run: `node --test tests/admin-auth.test.cjs`

```bash
git add api/admin-auth.cjs tests/admin-auth.test.cjs
git commit -m "feat: add RUDI admin authentication"
```

---

### Task 2: Date-specific section skip and text overrides

**Files:**
- Create: `api/section-controls.cjs`
- Test: `tests/section-controls.test.cjs`

**Interfaces:**
- Consumes: `loadRudiSettings`, control-plane cache.
- Produces: `setSectionSkip(date, section, value, options)`
- Produces: `getSectionSkip(date, section, options)`
- Produces: `setContentOverride(date, section, parts, options)`
- Produces: `getContentOverride(date, section, options)`
- Produces: `clearContentOverride(date, section, options)`
- Produces: `runWithPublicationContext(context, fn)`
- Produces: `applySectionControlToTelegramRequest(input, init, options) -> Promise<{handled, response, init, section}>`

- [ ] **Step 1: Write failing skip/override tests**

```js
test('skip returns synthetic Telegram success for matching topic/date', async () => {
  const cache = memoryCache({ 'skip:2026-08-30:facts': true });
  const result = await applySectionControlToTelegramRequest(
    'https://api.telegram.org/botSECRET/sendMessage',
    { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ message_thread_id:72, text:'original' }) },
    { cache, settings: fallbackSettings, date:'2026-08-30' }
  );
  assert.equal(result.handled, true);
  assert.equal((await result.response.json()).result.suppressed_by_admin, true);
});

test('four recipe override parts replace four sequential recipe sends', async () => {
  // Run four calls inside one runWithPublicationContext and assert part 1..4 order.
});
```

- [ ] **Step 2: Define cache keys and validation**

Use:

```text
skip:<YYYY-MM-DD>:<section>
content-override:<YYYY-MM-DD>:<section>
```

Content override shape:

```js
{
  parts: ['message 1', 'message 2'],
  updatedAt: 'ISO',
  updatedBy: 'admin'
}
```

Every part must be a non-empty string, max 4096 characters. Maximum 8 parts. Section must exist in settings and have a Telegram topic ID for generated-text controls.

- [ ] **Step 3: Add request-scoped part counters with `AsyncLocalStorage`**

```js
const publicationContext = new AsyncLocalStorage();
function runWithPublicationContext(context, fn) {
  return publicationContext.run({ ...context, partIndexes: new Map() }, fn);
}
```

When an override is present, increment the counter for that section. Replace the outgoing text/caption with `parts[index]`. If generated runtime tries to send more original parts than the override contains, return synthetic success to suppress extras. Admin creates overrides from preview parts, so normal override counts match section shape.

- [ ] **Step 4: Map topic IDs using effective settings**

Do not hard-code topic IDs again. Build `{ topicId -> section }` from `settings.sections.*.topicId`. Native cinema/labor/weekend skip is handled by section runners before this middleware.

- [ ] **Step 5: Run and commit**

Run: `node --test tests/section-controls.test.cjs`

```bash
git add api/section-controls.cjs tests/section-controls.test.cjs
git commit -m "feat: add runtime section controls"
```

---

### Task 3: Apply controls to generated Telegram publications

**Files:**
- Modify: `api/topic-maintenance.cjs`
- Modify: `api/index.js`
- Test: `tests/generated-section-controls.test.cjs`

**Interfaces:**
- Consumes: `applySectionControlToTelegramRequest`, `runWithPublicationContext`.
- Existing `handleTelegramTopicRequest` public interface remains stable.

- [ ] **Step 1: Write failing middleware-order test**

Assert admin skip happens before client-advice rewrite and Facts/Lulu dedupe, so skipped posts do not consume dedupe history or remote advice fetches.

- [ ] **Step 2: Apply controls at the start of `wrapFetch`**

Order becomes:

```text
section admin control
→ client advice rewrite
→ poster rewrite
→ Facts/Lulu dedupe
→ Telegram request
→ holiday rollover tracking
```

If control returns `handled:true`, return its synthetic response immediately.

- [ ] **Step 3: Wrap daily generated runtime in publication context**

In `runRuntime`, when `req.query.route === 'daily'`, resolve the Moscow date once and call:

```js
return runWithPublicationContext({ date: dateKey }, () => runtime(req, res));
```

Do not apply publication override context to preview requests because preview must remain side-effect-free and display overrides separately through the preview/admin service.

- [ ] **Step 4: Run existing topic/dedupe tests**

Run: `node --test tests/generated-section-controls.test.cjs tests/*topic*.test.cjs tests/daily-content*.test.cjs tests/clients-advice*.test.cjs`

- [ ] **Step 5: Commit**

```bash
git add api/topic-maintenance.cjs api/index.js tests/generated-section-controls.test.cjs
git commit -m "feat: apply admin controls to generated posts"
```

---

### Task 4: Normalize preview sections into editable message parts

**Files:**
- Create: `api/preview-sections.cjs`
- Modify: `api/preview.js`
- Test: `tests/preview-sections.test.cjs`

**Interfaces:**
- Produces: `extractPreviewSection(payload, section) -> { section, parts, metadata }`
- Produces: `applyPreviewContentOverride(sectionView, override) -> sectionView`
- Preview response gains normalized `sections` object but keeps original `results` for backward compatibility.

- [ ] **Step 1: Write extraction tests against actual current preview shape**

Use fixtures matching production:

```js
const payload = {
  results: {
    events: { preview: { concerts: 'concert text', stage: 'stage text' } },
    holidays: { preview: { message: 'holiday text' } },
    facts: { preview: { message: 'fact text' } },
    morning: { preview: { lulu: 'lulu text', recipes: ['b','l','s','d'] } },
    clients: { preview: { message: 'client text' } },
  }
};
```

Expected section mapping:

```js
facts.parts.length === 1
lulu.parts.length === 1
recipes.parts.length === 4
events.parts.length === 2
holidays.parts.length === 1
clients.parts.length === 1
```

- [ ] **Step 2: Implement extractor**

Do not infer missing content. Missing runtime preview field returns `parts: []` with `metadata.available=false`.

- [ ] **Step 3: Overlay admin text only in normalized section view**

The raw `results` remain untouched for debugging. `sections.<name>.parts` shows effective override content plus `overridden:true`.

- [ ] **Step 4: Run and commit**

Run: `node --test tests/preview-sections.test.cjs tests/preview-control-plane.test.cjs`

```bash
git add api/preview-sections.cjs api/preview.js tests/preview-sections.test.cjs
git commit -m "feat: normalize editable preview sections"
```

---

### Task 5: Manual single-section publisher

**Files:**
- Create: `api/manual-section-publisher.cjs`
- Test: `tests/manual-section-publisher.test.cjs`

**Interfaces:**
- Consumes: preview section extractor, content overrides, effective settings, publication journal, existing Telegram topic wrapper.
- Produces: `publishSelectedSection({ section, date, force }, options) -> Promise<result>`

- [ ] **Step 1: Write section isolation test**

```js
test('publishing facts sends only facts topic message', async () => {
  const sends = [];
  await publishSelectedSection({ section:'facts', date:'2026-08-30', force:false }, {
    previewProvider: async () => fixturePreview,
    settingsLoader: fakeSettings,
    sendTelegram: async (payload) => { sends.push(payload); return { messageId: 101 }; },
    journal: fakeJournal,
  });
  assert.deepEqual(sends.map((x) => x.topicId), [72]);
});
```

- [ ] **Step 2: Implement publish-source priority**

For generated text sections `events`, `holidays`, `facts`, `lulu`, `recipes`, `clients`:

1. build current preview for requested date;
2. extract section parts;
3. overlay stored text override;
4. send only those parts to that section's configured topic ID through existing Telegram topic wrapper;
5. record returned message IDs in journal.

For native sections `cinema`, `labor`, `weekend`, delegate to `runNativeSection` instead of converting preview text.

- [ ] **Step 3: Enforce publication guards**

If journal says `published` and `force !== true`, return 409-style result `{ ok:false, error:'already-published' }`. `retry-failed` never sets force; it only permits records with status `failed`. Explicit admin `publish-section` may set `force:true` only after UI confirmation.

- [ ] **Step 4: Preserve event/recipe multi-part shape**

Events publish each available preview part in order; recipes publish each recipe part in order. Manual fallback is text-first and does not invent missing image assets. It still routes through `handleTelegramTopicRequest` so existing topic tracking/cleanup behavior remains active.

- [ ] **Step 5: Run and commit**

Run: `node --test tests/manual-section-publisher.test.cjs`

```bash
git add api/manual-section-publisher.cjs tests/manual-section-publisher.test.cjs
git commit -m "feat: publish one RUDI section manually"
```

---

### Task 6: Signed feedback callbacks and analytics counters

**Files:**
- Create: `api/feedback-analytics.cjs`
- Modify: `api/topic-maintenance.cjs`
- Modify: `api/index.js`
- Test: `tests/feedback-analytics.test.cjs`

**Interfaces:**
- Produces: `buildFeedbackMarkup(section, date, env) -> reply_markup|null`
- Produces: `parseFeedbackCallback(data, env) -> {section,date,vote}|null`
- Produces: `handleFeedbackCallback(req, options) -> Promise<boolean>`
- Produces: `getSectionAnalytics(section, options)` and `listSectionAnalytics(sections, options)`

- [ ] **Step 1: Write signed callback tests**

Callback base format:

```text
rf1:<section>:<YYYYMMDD>:<u|d>:<8hex>
```

Signature is first 8 hex characters of `HMAC-SHA256(secret, unsignedData)`. Secret priority: `RUDI_FEEDBACK_SECRET`, then `CRON_SECRET`. If neither exists, feedback markup is disabled rather than unsigned.

- [ ] **Step 2: Write acknowledgement-order test**

Injected `answerCallbackQuery` must be called before cache `set` resolves. Use a deferred Promise to prove acknowledgement happens first.

- [ ] **Step 3: Attach feedback markup only to eligible recurring sections**

In Telegram request middleware, for `sendMessage`/`sendPhoto` targeting events, holidays, facts, lulu, recipes, clients, cinema, labor, weekend, attach:

```js
{ inline_keyboard: [[
  { text: '👍', callback_data: upData },
  { text: '👎', callback_data: downData }
]] }
```

Do not overwrite existing non-feedback `reply_markup`; merge only when safe, and exclude Products/Alice flows.

- [ ] **Step 4: Handle callback before passive-message/product filters**

In `api/index.js` Telegram route:

```js
if (await handleFeedbackCallback(req, deps)) {
  return res.status(200).json({ ok:true, handled:'feedback' });
}
```

Invalid/stale signature returns false and falls through safely. Valid callback uses `callback_query.message.message_id` from Telegram update as the message identity and increments one aggregate vote for that callback event. Store a callback-query ID dedupe key to avoid double-counting retries.

- [ ] **Step 5: Store analytics**

Key `analytics:<section>`:

```js
{
  publications: 0,
  successfulPublications: 0,
  failures: 0,
  positiveFeedback: 0,
  negativeFeedback: 0,
  sourceFailures: 0,
  duplicateSuppressions: 0,
  updatedAt: 'ISO'
}
```

Journal/dedupe/source-health modules call a small exported `incrementSectionMetric` hook after their own successful durable state operation. Metric failure must log and not break publishing.

- [ ] **Step 6: Run and commit**

Run: `node --test tests/feedback-analytics.test.cjs tests/*telegram*.test.cjs tests/*callback*.test.cjs`

```bash
git add api/feedback-analytics.cjs api/topic-maintenance.cjs api/index.js tests/feedback-analytics.test.cjs
git commit -m "feat: add RUDI feedback analytics"
```

---

### Task 7: Authenticated admin API

**Files:**
- Create: `api/admin-api.cjs`
- Create: `api/admin.js`
- Test: `tests/admin-api.test.cjs`

**Interfaces:**
- Produces: `buildAdminDashboard(options)`
- Produces: `handleAdminAction(action, body, options)`
- `api/admin.js` authenticates then delegates GET/POST.

- [ ] **Step 1: Write dashboard/auth/action tests**

GET dashboard returns:

```js
{
  ok: true,
  health,
  previews: { today, tomorrow },
  settings,
  overrides,
  skips,
  journal,
  sourceHealth,
  alerts,
  analytics
}
```

POST with unknown action must return 400 and mutate nothing.

- [ ] **Step 2: Implement exact action allowlist**

Supported actions:

```text
set-section-enabled
reset-setting-override
skip-section
clear-section-skip
set-content-override
clear-content-override
publish-section
retry-failed-section
acknowledge-alert
refresh-preview
```

No generic key/value setter and no arbitrary source URL editor.

- [ ] **Step 3: Validate every mutation**

- `set-section-enabled`: existing section + boolean only.
- `skip/clear`: valid date + section only.
- `set-content-override`: valid date/section and parts constraints from Task 2.
- `publish-section`: valid section/date; `force` boolean only.
- `retry-failed-section`: require journal status `failed`.
- `acknowledge-alert`: 64-char max lowercase hex fingerprint.

- [ ] **Step 4: Return refreshed partial state after mutations**

Actions return the updated section/settings/journal data needed for UI refresh; do not make the browser guess local state.

- [ ] **Step 5: Run and commit**

Run: `node --test tests/admin-api.test.cjs tests/admin-auth.test.cjs`

```bash
git add api/admin-api.cjs api/admin.js tests/admin-api.test.cjs
git commit -m "feat: add RUDI admin API"
```

---

### Task 8: Framework-free admin UI

**Files:**
- Create: `public/admin.html`
- Modify: `public/index.html`
- Modify: `vercel.json`
- Test: `tests/admin-static.test.cjs`

**Interfaces:**
- Browser calls `/api/admin` with `Authorization: Bearer <sessionStorage secret>`.

- [ ] **Step 1: Write static security test**

Read `public/admin.html` as text and assert it does not contain `CRON_SECRET`, `RUDI_ADMIN_SECRET`, a bearer token literal, external script URLs, or inline values resembling known production tokens.

- [ ] **Step 2: Build one-file admin page**

Required UI regions:

```text
Header: RUDI / Moscow time / health badge
Auth gate: password input + Connect
Today / Tomorrow tabs
Section cards: enabled, status, source state, preview text
Editor: one textarea per message part
Actions: save text, clear text, enable/disable, skip/unskip, publish section, retry failed
Failures/alerts panel
Analytics table: publications, failures, 👍, 👎, positive ratio, duplicate suppressions
Overrides panel
```

Use readable responsive CSS, no framework/CDN dependency.

- [ ] **Step 3: Store secret only in `sessionStorage`**

```js
sessionStorage.setItem('rudiAdminSecret', secret);
```

Never place it in query parameters or localStorage. A 401 clears session storage and returns to auth gate.

- [ ] **Step 4: Add confirmations for destructive/send actions**

Use `window.confirm()` before force publish, retry, skip, disable, clear override, and alert acknowledgement. Ordinary preview refresh does not require confirmation.

- [ ] **Step 5: Add `/admin` static rewrite**

In `vercel.json` add:

```json
{ "source": "/admin", "destination": "/admin.html" }
```

Keep `git.deploymentEnabled: false` and the current cron untouched.

- [ ] **Step 6: Update `/` landing page**

Keep it simple: service name, `RUDI is running`, and link to `/admin`. Do not expose health internals or secret prompts on the landing page.

- [ ] **Step 7: Run and commit**

Run: `node --test tests/admin-static.test.cjs tests/vercel-deployment-policy.test.cjs`

```bash
git add public/admin.html public/index.html vercel.json tests/admin-static.test.cjs
git commit -m "feat: add RUDI admin dashboard"
```

---

### Task 9: Admin/analytics end-to-end regression coverage

**Files:**
- Create: `tests/control-plane-e2e.test.cjs`

**Interfaces:**
- Uses only injected memory cache, fake Telegram fetch and fake preview source.

- [ ] **Step 1: Write the complete no-deploy workflow test**

Test sequence:

```text
1. Admin authenticates with CRON_SECRET fallback.
2. GET dashboard shows facts enabled and today's original preview.
3. Admin saves a facts text override.
4. GET dashboard shows overridden preview.
5. Daily generated facts send is rewritten to override text.
6. Feedback markup is attached.
7. Telegram callback is acknowledged and positiveFeedback increments.
8. Admin skips facts for tomorrow.
9. Tomorrow generated facts send is synthetically suppressed.
10. Admin clears skip and manually publishes only facts.
11. Only topic 72 is called and journal contains its message ID.
12. No call hits a real Telegram URL/network implementation.
```

- [ ] **Step 2: Add failure/retry workflow**

Simulate native cinema failure, ensure journal failed + one alert; admin retry only calls cinema runner, not generated runtime; second identical failure inside alert window does not send a second alert.

- [ ] **Step 3: Run targeted E2E test**

Run: `node --test tests/control-plane-e2e.test.cjs`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/control-plane-e2e.test.cjs
git commit -m "test: cover RUDI control plane workflows"
```

---

### Task 10: Final package verification before asking to deploy

**Files:**
- No planned production changes; fix only defects discovered by verification.

- [ ] **Step 1: Run complete test suite**

Run: `npm test`

Expected: 0 failures.

- [ ] **Step 2: Build**

Run: `npm run build`

Expected: exit 0.

- [ ] **Step 3: Validate config JSON**

```bash
node -e "for (const f of ['package.json','vercel.json','config/rudi-settings.json','config/daily-content.json','config/events.json']) JSON.parse(require('fs').readFileSync(f,'utf8'));"
```

- [ ] **Step 4: Search for accidental secrets**

Search final diff and new public/API files for actual environment values, `Authorization: Bearer` literals containing secrets, Telegram bot-token URL fragments, and copied production headers. Expected: no secret values.

- [ ] **Step 5: Inspect final diff against spec exclusions**

Confirm no weather, transport, or conversational-command feature was added. Confirm no automatic low-rated-section disabling exists.

- [ ] **Step 6: Inspect Vercel deployment history**

Use runtime/deployment inspection only; do not deploy. Verify development commits did not create a new production deployment.

- [ ] **Step 7: Request code review**

Use `superpowers:requesting-code-review` and resolve material findings before completion.

- [ ] **Step 8: Verification-before-completion**

Use `superpowers:verification-before-completion`; repeat `npm test` and `npm run build` after the final review fix.

- [ ] **Step 9: Summarize the finished package**

Report implemented features, removed routes, test/build results, and any known limitations. Do not deploy.

- [ ] **Step 10: Ask exactly one deployment question**

End with a separate line:

**Деплоим?**
