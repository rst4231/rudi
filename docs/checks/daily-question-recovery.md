# Daily question recovery verification, 2026-11-05

Production evidence: runtime log RUDI_DAILY_QUESTION_ERROR daily-question-ai-provider at 2026-11-05T04:50:35Z. The previous implementation discarded the provider status/code and labelled every cached-question fallback offline.

The regression verifies two retries (three provider requests total) before using the reserve, successful third-attempt recovery, generator refusal, then verifies a unique shared question per day, preserved yesterday answers, no replacement of an existing question, safe error metadata, reserve exhaustion without recycling questions, and correct online failure copy.

The provider request itself has not been retested with production credentials. These checks use injected provider responses. Production still runs v4.30 until approved deployment.

## Existing failures observed

`npm test` stops at four existing mood UI tests (these files are unchanged):

- dialog reuses weather dimensions and contains no emoji rendering
- actual dialog clicks show text, retain analyzer, save final draft and restore scroll
- actual custom answer form saves text; analyzer and Escape never save drafts
- keyboard focus stays inside dialog; busy save ignores cancel and duplicate clicks

`tests/daily-question.test.cjs` has five failures reproduced against the unmodified HEAD before this change:

- semantic anti-repeat catches close paraphrases
- answers stay hidden until both answer and reset with next daily question (fixture lacks a history cache and attempts unavailable D1 access)
- daily question row and history are durable and generation uses a cross-instance lock (stale static assertion about namespace placement)
- answer reward is 0.3 stars with one dedupe key per actor and date (stale reward expectation)
- daily question card is directly after message by default and supports collapse plus drag persistence (stale layout assertion)

`tests/content-offline.test.cjs` also fails its unchanged static test `shell, UI and API are connected without storing auth in snapshots` because it expects the former home-note enqueue call. The implementation it checks is unchanged.

These failures were not changed or suppressed in the repository. Targeted checks are reported separately from the full suite.

## Personal calendar time ranges (same release)

Added separate native start/end inputs for Rustam tasks and server validation. Regression checks cover create/update, invalid ranges, clearing an end time, preserving duration when legacy clients omit it, switching tasks, offline persistence/replay, and offline drag duration.

Additional existing verification limits observed:

- `personal-ticktick-recurrence.test.cjs`: `mobile recurring controls shown for personal TickTick and hide for never` expects a hardcoded obsolete asset version `4.285-recurrence1`.
- `calendar-time-save-latency.test.cjs` cannot load because this workspace lacks the test dependency `fake-indexeddb`. The regular calendar-offline suite uses its independent IndexedDB fixture and passes, including interval persistence and replay.

No real browser binary is available in this workspace. Editor behavior was exercised in JSDOM; native iOS picker rendering was not visually retested.
