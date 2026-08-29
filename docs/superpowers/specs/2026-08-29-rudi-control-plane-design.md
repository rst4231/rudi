# RUDI Control Plane Design

## Goal

Turn `spb-daily-guide-bot` into a more reliable, observable and configurable personal publishing system while minimizing Vercel deployments. This package implements the approved improvements from items 1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13 and 15. It explicitly excludes weather, transport and conversational bot commands.

## Constraints

- Do not deploy to Vercel while implementing or testing this package.
- Work on `fix/daily-content-reliability-clean`, which is already deployment-disabled in the current Vercel configuration.
- Do not merge to `main` until the complete package passes tests and the user explicitly approves publication.
- Prefer runtime configuration and Runtime Cache over hard-coded operational settings.
- Keep a bundled JSON fallback for every externally loaded configuration so production remains usable if GitHub/raw config fetch fails.
- Preserve the current Telegram topics and current daily publishing behavior unless a requirement below explicitly changes it.
- Do not add weather, transport, or user-facing conversational commands.
- Avoid new infrastructure unless the existing Vercel Runtime Cache and current project structure cannot satisfy a requirement.

## Current State

The project already has several useful foundations:

- Daily content and event settings can be loaded from raw GitHub JSON with a five-minute in-process memo.
- Vercel Runtime Cache is wrapped by `api/strict-runtime-cache.cjs` and is already used for durable state.
- Facts and Lulu have stable sequence support and published-ID protections.
- Events already isolate Yandex and Stage source failures and retry source loading.
- Tests run with Node's built-in test runner.
- `public/index.html` exists but is only a placeholder.

The main gaps are operational visibility, unified runtime settings, durable publication state, generalized deduplication, source health, alert suppression and a useful admin surface.

## Architecture Overview

Add a control-plane layer around the existing runtime rather than rewrite the generated runtime. The current generated runtime remains responsible for producing and sending the existing daily sections. New focused modules wrap it with configuration, state, observability and administrative controls.

There are four layers:

1. **Settings layer**: bundled `config/rudi-settings.json` plus optional Runtime Cache overrides.
2. **State layer**: publication journal, source health, dedupe fingerprints, alerts and feedback counters in Runtime Cache.
3. **Control API layer**: health, preview, admin data/actions, feedback callback handling and section-level retry/publish controls where supported.
4. **Admin UI**: a static `/admin` page that calls authenticated admin APIs and renders current/next-day state without requiring a frontend framework.

## 1. Unified Settings

Create `config/rudi-settings.json` as the canonical fallback configuration. A loader module validates it, loads an optional remote JSON URL, then overlays mutable Runtime Cache overrides.

The unified settings must contain operational controls, external catalog locations and reusable copy controls. Specialized catalogs such as `daily-content.json`, `events.json` and `clients-advice.json` remain separate data stores, but the active URLs used to load them are selected by `rudi-settings.json` and can be overridden in Runtime Cache without deployment.

Initial schema:

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

Operational changes in admin write only an override object to Runtime Cache. They do not edit GitHub and do not require deployment. A reset action deletes selected overrides and falls back to remote/bundled settings.

Dated text replacements are stored separately as content overrides, because a one-day post replacement is not global configuration. Reusable section footers come from `copy.footers` and are applied by publication middleware.

The Vercel cron expression itself must remain in `vercel.json`, because Vercel only configures project Cron Jobs during deployment. The control plane may expose the effective cron and a human-readable description, but changing the actual cron schedule is not presented as a no-deploy operation.

## 2. Vercel Deployment Policy

Change `vercel.json` from branch-specific deployment suppression to:

```json
"git": { "deploymentEnabled": false }
```

This prevents future Git pushes from automatically creating deployments. Production deployment becomes an explicit manual action after user approval.

The existing `ignoreCommand` may remain as an additional safeguard, but it is no longer relied upon for deployment quota control.

## 3. Health Endpoint

`/api/health` must report the current runtime state, not stale hard-coded labels.

Response includes:

- service name and current Moscow date/time;
- application/config version;
- current effective section settings;
- topic IDs from effective settings/config;
- configured cron expression and description;
- last daily run summary;
- latest journal record per section;
- latest source health per source;
- current alert state;
- no removed Sevkabel/Brusnitsyn rubric in event order.

Health remains read-only and does not require admin authentication.

## 4. Preview Endpoint

`/api/preview` accepts `date` values:

- `today`
- `tomorrow`
- explicit `YYYY-MM-DD`

If omitted, default to `today`, not a stale generated date.

The preview API calls the existing runtime in dry-run mode where possible and returns normalized cards for enabled sections. It must never send Telegram messages.

The response includes `requestedDate`, `generatedAt`, `settingsVersion`, section status, preview content, source health and validation warnings. Normalized section views expose message parts so the same payload can power the admin text editor and manual single-section publication.

## 5. Admin Authentication

Admin API and `/admin` use a shared secret.

Priority:

1. `RUDI_ADMIN_SECRET`
2. `CRON_SECRET` as fallback

The browser must not receive the secret embedded in HTML or JavaScript. The admin page asks for the secret once and stores it only in `sessionStorage`. API requests send it in `Authorization: Bearer <secret>`.

Use constant-time comparison for supplied and expected credentials.

## 6. Admin UI

Replace the placeholder static page with a small framework-free admin surface at `/admin` and keep `/` as a simple service landing page.

Admin shows:

- current date/time in Moscow;
- service health;
- today and tomorrow preview cards;
- section enabled/disabled state;
- last publication status per section;
- current source health;
- recent failures;
- feedback statistics;
- current Runtime Cache overrides.

Supported actions:

- enable/disable a section;
- skip a section for a specific date;
- reset a section override;
- clear a temporary skip;
- edit the normalized message parts for a specific section/date and save the dated content override;
- clear a dated content override;
- publish only one selected section without replaying the complete daily runtime;
- retry a failed native section;
- request a dry-run refresh;
- acknowledge an alert.

Dangerous actions require a browser confirmation. Source URLs and reusable footers are validated settings fields; dated post text is edited through content overrides rather than arbitrary code/config editing.

## 7. Publication Journal

Create a durable journal API backed by Runtime Cache.

Key model:

`journal:<date>:<section>`

Record shape:

```json
{
  "date": "2026-08-30",
  "section": "facts",
  "status": "published",
  "attempts": 1,
  "startedAt": "...",
  "finishedAt": "...",
  "messageIds": [123],
  "sourceIds": ["daily-content"],
  "fingerprints": ["..."],
  "error": null
}
```

Allowed states: `pending`, `published`, `skipped`, `failed`.

A section that is already `published` for the same date is not automatically sent again. Explicit admin retry can bypass the guard only for a failed section, not a published section. A separate force-confirmed manual publish action exists for deliberate re-publication of one section.

The daily wrapper records section-level state for native modules it controls directly and stores an overall daily run record. For sections still sent inside the generated runtime, the wrapper records the normalized runtime result after completion. This avoids a risky rewrite of the packed runtime in the first control-plane package.

## 8. Failure Isolation and Retry

The daily orchestrator must continue running independent sections after a non-fatal section failure whenever their dependencies permit it.

Native sections such as cinema and labor get explicit journal state and can be retried independently.

Generated-runtime sections use the existing runtime's own source isolation and returned result object. The control plane must not resend the full daily runtime automatically just because one native section failed.

Automatic retry is limited to failed native sections and uses a small bounded attempt count. Admin retry is also section-specific.

## 9. Source Health and Quality Gates

Create a reusable source-health helper. Each supported external source records:

- source id;
- checked time;
- requested date if relevant;
- `healthy`, `empty`, `stale`, or `failed` status;
- item count;
- error string;
- optional fallback source used.

Quality checks:

- HTTP success;
- response can be parsed;
- requested date is not contradicted by source content where date metadata exists;
- poster URL is valid before Telegram submission;
- empty is distinct from failed;
- stale data is not treated as fresh success.

Existing Yandex/Stage retries remain and report into source health. Cinema source fallback uses the existing source/fallback URL configuration and records which source succeeded.

## 10. Generalized Deduplication

Introduce a generic fingerprint helper for non-Facts/Lulu content.

Fingerprint rules normalize:

- Unicode case;
- `ё` to `е`;
- whitespace;
- punctuation that does not change identity;
- URL tracking parameters where applicable.

Domain-specific identity:

- recipes: recipe id/title + normalized ingredients;
- client advice: advice id/title/body fingerprint;
- events: source event id when present, otherwise date + title + venue + time;
- cinema: title + release/source identity;
- weekend cards: constituent item fingerprints.

Store recent fingerprints with configurable retention windows from settings. Facts/Lulu keep their current stable ID sequence and published-ID mechanism; the new helper must not replace that proven logic.

## 11. Weekend Plan

Add a Friday/Saturday weekend digest, controlled by `sections.weekend.enabled` and `publishing.weekendDays`.

It reuses already-fetched event/cinema information and selects a compact mix rather than introducing new sources. Target composition is up to 7 items across categories such as concert, stand-up, cinema and another available event type.

Requirements:

- do not duplicate the same item within the digest;
- avoid recently published weekend fingerprints;
- never invent an event;
- if fewer than three verified items exist, skip the weekend digest rather than publish filler;
- record a journal entry and source health.

No weather or transport text is included.

## 12. Alerts and Runtime Warnings

Create one alert service for operational failures.

Alerts are emitted only for actionable problems such as:

- a required section failed after retries;
- all event sources failed;
- cinema had no usable source due to errors, not legitimate emptiness;
- durable state writes fail;
- a daily run completes with failed required sections.

Identical alert fingerprints are suppressed for `alerts.dedupeMinutes`.

Alert delivery uses Telegram through the existing bot token and forum chat. The default destination is the main forum chat without creating a new topic. If a dedicated admin topic is later configured, settings may override it.

Alerts must never expose secrets, authorization headers or raw environment values.

The existing repeated Node `[DEP0169] url.parse()` warning is not accepted as permanent noise. Implementation must trace its origin under Node 24 and remove the RUDI-owned legacy parser or update the responsible compatible dependency. Warning suppression flags are not an acceptable fix. A regression test must exercise the handler with `--trace-deprecation` and fail if `DEP0169` remains.

## 13. Feedback and Utility Analytics

Add lightweight feedback buttons to eligible recurring content: `👍` and `👎`.

Callback data uses a compact signed/validated internal format that identifies section/date; Telegram's callback message supplies the actual message ID.

Runtime Cache stores aggregates:

- publications;
- successful publications;
- failures;
- positive feedback;
- negative feedback;
- source failures;
- duplicate suppressions.

The admin UI displays counts and positive-feedback ratio. No section is automatically disabled based on these metrics.

Feedback handling must ignore stale/invalid callbacks safely and acknowledge valid callbacks quickly to avoid Telegram `query is too old` errors.

## 14. Cleanup of One-Time Endpoints

Remove expired one-time recovery/backfill API handlers after confirming they are not referenced by `vercel.json`, tests or active modules.

Candidates include date-named handlers such as:

- `api/cinema-backfill-20260820.js`
- `api/cinema-replace-20260820.js`
- `api/recover-20260823.js`
- `api/repair-daily-content-20260824.js`

Also remove or update tests that exist only to validate an expired one-time route. Do not delete reusable cinema, topic, collage or recovery primitives just because their names relate to earlier fixes.

## 15. Testing Strategy

All changes follow test-first development.

Required regression coverage:

- settings validation and Runtime Cache overlay/reset;
- operational source URL and reusable footer overrides without deployment;
- admin auth, including CRON_SECRET fallback and rejection paths;
- preview date resolution for today/tomorrow/explicit date;
- health output contains only active rubrics;
- publication journal state transitions and same-date idempotency;
- source health empty vs failed vs stale;
- generalized fingerprints and retention behavior;
- weekend digest minimum-item rule and duplicate suppression;
- alert deduplication;
- `DEP0169 url.parse()` is absent in traced Node 24 handler execution;
- feedback callback acknowledgement and aggregate counters;
- admin action validation;
- dated text override affects preview/automatic publication and can be cleared;
- manual section publication sends only the selected section;
- Vercel config has `git.deploymentEnabled=false`;
- expired one-time routes are absent from the active API tree;
- existing test suite remains green;
- `npm run build` succeeds.

No test may call real Telegram APIs or mutate production Runtime Cache. Use injected fetch/cache doubles.

## 16. Rollout

Implementation occurs entirely on the deployment-disabled working branch. No Vercel preview or production deployment is created during development.

Before requesting deployment:

1. run the complete test suite;
2. run the build;
3. inspect the final diff for removed routes and accidental secrets;
4. verify `main` has not been modified;
5. summarize changes and known limitations;
6. ask the user exactly: **Деплоим?**

Only after explicit approval may the final code be merged/promoted and a production deployment be created.

## Non-Goals

This package does not add:

- weather;
- transport/metro/traffic notices;
- Telegram conversational commands such as `что сегодня?`;
- automatic disabling of low-rated sections;
- a new database, Redis instance, Edge Config project or third-party CMS;
- arbitrary code/config editing from the admin browser.
