# Partner budget status

Show Лимит исчерпан in the partner's finance block when a configured monthly budget is fully spent or exceeded. Show only this phrase for budget status, without limits, remaining amounts or percentages. Existing last-expense and largest-purchase sections are unchanged. Hide the status when no limit is configured, data is unavailable, or spending is below the limit. Reuse the existing actor-specific financial summary and its effective-month limits; no extra requests or financial writes.

Validation: 18 focused tests pass, including both partner identities, exact threshold, overspending, unconfigured budget, clearing the status, and the Moscow month boundary with a scheduled limit. Regression tests failed before implementation. Build, JavaScript syntax and whitespace checks pass.

Full npm test stops at four pre-existing mood-picker-flow.test.cjs failures:

- dialog reuses weather dimensions and contains no emoji rendering
- actual dialog clicks show text, retain analyzer, save final draft and restore scroll
- actual custom answer form saves text; analyzer and Escape never save drafts
- keyboard focus stays inside dialog; busy save ignores cancel and duplicate clicks

Those files are unchanged. Production deployment awaits approval.
