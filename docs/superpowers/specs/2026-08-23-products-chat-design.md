# Products Chat Design

## Goal
Replace the shared pinned shopping-list workflow with a plain Telegram forum-topic chat.

## Telegram behavior
- Topic id `263` is a normal chat thread.
- Human messages in the topic remain exactly as the user sent them.
- RUDI must not delete, edit, aggregate, hydrate, or republish human product messages.
- RUDI must not create or maintain a shared list message.
- RUDI must not add `Куплено`, `Очистить`, or other list-management buttons.
- RUDI must not pin newly created product messages.
- Legacy callbacks from the old list are acknowledged and ignored so they cannot mutate state.

## Alice behavior
- The existing Alice shopping entrypoint remains available.
- A new Alice session with no product text still asks `Какие продукты вы хотите добавить?`.
- For a `SimpleUtterance`, strip only the existing add-command prefix (for example `добавь`, `добавить`, `в список`) and preserve the remaining product text.
- RUDI sends that remaining text as one ordinary Telegram `sendMessage` into forum topic `263`.
- The Telegram message contains only the product text. No heading, source label, author line, timestamp, buttons, or reply markup.
- Alice returns a short success response and does not invoke the legacy shared-list runtime.
- Clear/reset commands do not create Telegram messages because there is no shared list to clear.

## Legacy retirement
- The production cutover performs a one-time topic-local unpin using Telegram `unpinAllForumTopicMessages` for topic `263`.
- Existing durable shared-list state is cleared once so it cannot be accidentally rehydrated by old code.
- The legacy list modules may remain temporarily for compatibility with unrelated tests, but the active Telegram and Alice routes no longer enter them.

## Reliability and safety
- Other Telegram topics and the daily runtime remain unchanged.
- The new Alice-to-Telegram sender resolves the existing forum chat id and bot token through current project helpers.
- Telegram API failures return an error rather than silently claiming the item was added.
- Preview deployment stays disabled for the working branch; production deployment happens only after explicit approval.
