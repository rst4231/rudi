# Products Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy shared/pinned product list with plain Telegram messages, while letting Alice ask RUDI to post product text into topic 263.

**Architecture:** Add a focused `products-chat.cjs` adapter for detecting the products topic, cleaning Alice text, sending Telegram messages, and acknowledging legacy callbacks. Route Telegram topic 263 and Alice shopping requests through this adapter before any legacy list code. Add a one-time protected retirement endpoint to unpin the old topic and clear durable list state.

**Tech Stack:** Node.js CommonJS, Telegram Bot API, Vercel serverless functions, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-23-products-chat-design.md`

## Global Constraints
- Telegram products topic id is exactly `263`.
- Human Telegram messages must remain unchanged and must not invoke legacy list runtime.
- Alice-originated Telegram messages contain only cleaned product text and no reply markup.
- No new product message may be pinned.
- No active product path may expose `Куплено` or `Очистить` list-management behavior.
- Working branch must not create a Vercel preview deployment.

---

### Task 1: New products-chat adapter

**Files:**
- Create: `api/products-chat.cjs`
- Test: `tests/products-chat-mode.test.cjs`

**Interfaces:**
- Produces: `PRODUCTS_TOPIC_ID`, `isProductsTopicUpdate(req)`, `cleanAliceProductText(req)`, `buildAliceProductAddedResponse(req)`, `sendAliceProductMessage(req, options)`, `acknowledgeLegacyProductsCallback(req, options)`.

- [ ] **Step 1: Write failing tests** for topic detection, exact Alice text cleaning, plain Telegram payload, and callback acknowledgement.
- [ ] **Step 2: Run the tests and verify they fail** because `api/products-chat.cjs` does not exist.
- [ ] **Step 3: Implement the adapter** with Telegram `sendMessage` payload `{chat_id, message_thread_id:263, text}` and no `reply_markup`.
- [ ] **Step 4: Run the focused tests and verify they pass**.
- [ ] **Step 5: Commit** adapter and tests.

### Task 2: Bypass the legacy shared list in active routes

**Files:**
- Modify: `api/index.js`
- Modify: `tests/index-products-hardening.test.cjs`
- Modify: `tests/products-integration.test.cjs`
- Remove or replace: `tests/products-ui-simplification.test.cjs`

**Interfaces:**
- Consumes: products-chat adapter from Task 1.
- Produces: Telegram topic 263 early-return path and direct Alice-to-Telegram path.

- [ ] **Step 1: Update tests first** so they require product-topic updates to bypass `runRuntime`, `runProductsAddition`, clear handlers, and bought handlers; require Alice `SimpleUtterance` to call `sendAliceProductMessage`.
- [ ] **Step 2: Run tests and verify they fail** against the current entrypoint.
- [ ] **Step 3: Modify `api/index.js` minimally**: intercept topic 263 before passive-message/legacy list handling; acknowledge old callbacks; return 200 for human topic updates; send Alice product text directly through the adapter; retain launch prompt and non-product routes.
- [ ] **Step 4: Run focused tests and verify they pass**.
- [ ] **Step 5: Commit** route cutover.

### Task 3: Retire the old pinned list once

**Files:**
- Create: `api/retire-products-list.js`
- Create: `tests/products-retirement.test.cjs`

**Interfaces:**
- Consumes: forum chat-id resolver, Telegram token resolver, durable product cache.
- Produces: key-protected one-time endpoint that calls `unpinAllForumTopicMessages` for topic 263 and clears durable products state.

- [ ] **Step 1: Write failing tests** requiring a date/key protected endpoint, topic-local unpin, and direct durable clear without invoking generated runtime.
- [ ] **Step 2: Run tests and verify they fail** because the endpoint is missing.
- [ ] **Step 3: Implement the endpoint** using Telegram `unpinAllForumTopicMessages` with `{chat_id,message_thread_id:263}` and `clearProducts({cache})`.
- [ ] **Step 4: Run focused tests and verify they pass**.
- [ ] **Step 5: Commit** retirement endpoint.

### Task 4: Full verification

**Files:**
- No new production files unless verification exposes a regression.

- [ ] **Step 1: Run `npm test`** and require zero failures.
- [ ] **Step 2: Run `npm run build`** and require success.
- [ ] **Step 3: Inspect PR diff** to verify no daily/event/labor behavior was accidentally changed.
- [ ] **Step 4: Verify Vercel branch preview remains disabled**.
- [ ] **Step 5: Stop before production merge/deploy and request explicit approval**.
