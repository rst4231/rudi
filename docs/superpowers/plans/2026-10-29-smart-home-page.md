# Smart Home Page Implementation Plan

> **For agentic workers:** Execute inline with superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** A compact device overview on home and a dedicated smart home page.
**Architecture:** Existing vanilla JS router and shared smart-home state; DOM render helpers reuse device controls.
**Tech Stack:** JavaScript, CSS, HTML, Node tests and Playwright.
**Spec:** docs/superpowers/specs/2026-10-29-smart-home-page-design.md

## Global Constraints
- Base production v4.374; no deploy or remote push before approval.
- No added polling or duplicate initial fetches.
- Preserve actor privacy and offline command locks; battery low <10%.

## Review Focus
- Unavailable devices with stale on=true must not appear enabled.
- Invalid battery values and absent capabilities must not create false alerts.
- Returning from page must restore home and scroll via existing navigation.
- Summary controls must update page and summary with a single command.
- Actor changes and fetch errors must never retain another actor's devices.

### Task 1: Page and shared summary
**Files:** public/index.html, public/app.js, public/smart-home.js, public/smart-home.css; tests/smart-home-page.test.cjs.
**Interfaces:** existing RUDI_NAVIGATE_TO_TAB and RUDI_GO_BACK; existing list/switch API.
- [x] Add behavioral tests for active/unavailable/battery states, summary control synchronization, navigation and actor changes; run RED.
- [x] Move rooms/scenarios to smart-home page, remove accordion config, add router entry and back controls.
- [x] Render shared summary and attention using visibleDevices, retain offline locks; test GREEN.
- [x] Verify mobile light/dark layouts and normal browser back.

### Task 2: Release verification
**Files:** VERSION, rudi-version.json; build-generated version references.
- [x] Run relevant smart home/offline/navigation tests and build.
- [x] Review final diff against v4.374; check current production again.
- [x] Record results and prepare one release. Ask Деплоим? without deploying.

Verification: 2026-10-29-smart-home-verification.md. Final release confirmation is pending; no deployment performed.
