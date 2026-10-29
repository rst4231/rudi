# Home cleanup, v4.376

User-approved requirements, in order of final scope:
- Active devices on the home smart-home card show only device names and green dots. Remove the Сейчас включены heading and chip backgrounds; reduce spacing. Control remains on the dedicated device page.
- Remove For Di, its page, feed loading, search results, generation/publishing and unused dedicated modules. Old routes return 410. Preserve all unrelated sections and leave stored historical data untouched.
- Remove the whole Quick Access block, including empty layout positions.
- Remove Dates and date generation, quota calls, old saved-date UI and active date saving. Keep shared saved recipes and their offline behavior working.
- Move the existing Create Photo Session link into Photos between the memory section and photo grid, retaining its destination. No duplicate shortcut.
- Start from production v4.375 (3fddc83d00648f4132a4e9f35807ac97b16ea47a). One release for all changes. No deployment until the user's final confirmation.

Implementation: existing page router and CSS; dedicated removed APIs respond Gone for old clients; stop retired daily jobs at their entry points and runtime build patch. Preserve migration namespace metadata for archived data. Remove obsolete feature-only tests; adapt shared tests to the requested behavior.

Final additions: fasting history uses a single calendar month with local previous/next navigation and day details; completed sessions are assigned to their completion date in Moscow. Duration labels use up to two nonzero units, 30-day approximate months and 365-day years. The fasting bottom navigation transition is intentional and must remain unchanged. Finance selectors which followed the old current month advance at Moscow month boundaries and on foreground recovery, using existing change handlers. Explicit historical selection and edited shared-month drafts remain intact.
