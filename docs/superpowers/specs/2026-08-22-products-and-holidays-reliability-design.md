# Products and Holidays Reliability Design

## Scope

Harden the shared shopping-list flow and holiday-topic rollover without introducing another external service or additional production deployments during development.

The shopping list must survive serverless cold starts and cache propagation delays, must not silently become empty, must not resurrect the historical hard-coded `фарш куриный` seed, and must show who last updated the visible Telegram list. The Holidays topic must keep only the newest successfully published holiday post/group.

## Products state

The existing Vercel Runtime Cache remains the storage backend, but product state stops using `@vercel/functions#getCache()` directly. That wrapper treats timeout/stale reads as `null` and swallows write failures, which is unsafe for mutable user state.

A strict cache adapter will use the same Vercel runtime-cache endpoint, headers, namespace separator, and key hash algorithm, but it will:

- retry stale reads and transient failures;
- accept only fresh cache reads;
- return `null` only after repeated HTTP 404 responses;
- throw when reads/writes cannot be confirmed;
- use a longer per-request timeout than the package default.

The existing replicated bucket state remains the durable model. Each mutation is written to four replicas and confirmed by reading it back. Tombstones and clear versions continue to prevent deleted products from returning from an older replica.

Legacy migration changes: the wrapper may migrate only a real persisted `products:history` array. It must never call the legacy reader when the durable store is empty because that reader can manufacture `фарш куриный`. A `legacy-seed` record for `фарш куриный` is ignored, while a later real user add of the same product remains valid.

If product storage is unavailable, the mutation fails rather than running the generated runtime with an empty list.

## Update author

The visible products message should contain one line:

`Обновлено: <имя> · HH:MM`

For Telegram mutations, `<имя>` is captured from the real Telegram sender before the shared actor ID is substituted. For Alice mutations, the author is `Алиса`.

If the generated runtime already emits an update line, it is replaced. If it omits one, the author line is appended only when the outgoing Telegram message is recognizable as the shopping list by its heading or shopping-list keyboard. Unrelated Telegram messages are not modified.

## Holidays topic

A successful new publication in topic 44 is allowed to complete first. Only after Telegram returns the new message ID(s) does rollover delete the previous holiday message/group.

The current holiday message IDs are stored in a strict replicated cache state. On the first run after deployment, if no rollover state exists, the handler scans existing topic-maintenance tracking for recent holiday message IDs and treats them as the previous publication.

If publishing the new holiday post fails, nothing is deleted. If deletion of the previous post fails, both old and new IDs are preserved as pending live IDs so the next successful publication retries cleanup. Media groups are treated as one publication and all message IDs are deleted together.

## Testing

Regression tests cover strict cache stale/failure behavior, empty initialization, real legacy migration, hard-coded chicken-mince suppression, later legitimate chicken-mince additions, concurrent additions, deletion/clear resurrection protection, Alice/Telegram author labels, unrelated-message safety, holiday single-post rollover, media groups, publish failures, delete failures, and first-run bootstrap from tracked topic messages.
